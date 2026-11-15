import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { normalizeCpf } from '../../common/cpf';
import { maskEmail } from '../../common/mask-email';
import {
  PAYMENT_LINK_SOURCE_COTAS,
  PaymentLinksGenerationService,
} from './payment-links-generation.service';
import {
  buildReuseKey,
  fromValueCents,
  normalizeMaybe,
  toValueCents,
} from './payment-links-reuse.util';
import {
  FinancialLinkModule,
  FinancialPaymentLinkReuseMode,
  toPrismaFinancialLinkModule,
  toPrismaLinkMode,
} from './payment-links-reuse.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isLegacyWrongOneMonthRecurrentLink,
  normalizeSinglePaymentCharge,
} from './payment-link-charge-intent';
import { AsaasPaymentLinkBillingType } from './asaas/asaas.types';

interface BaseResolvedLinkData {
  module: FinancialLinkModule;
  sourceKey: string;
  isMonthly: boolean;
  subscriptionDurationMonths?: number;
  value?: number;
  successUrl?: string;
  autoRedirect?: boolean;
  reuseMode: FinancialPaymentLinkReuseMode;
  presetId?: string;
  cpf?: string;
  payerName?: string;
  asaasLinkName: string;
  billingType?: AsaasPaymentLinkBillingType;
  maxInstallmentCount?: number;
  endDate?: string;
}

interface PublicCotasInput {
  reuseMode?: 'preset_global' | 'cpf_custom';
  presetKey?: string;
  isMonthly?: boolean;
  subscriptionDurationMonths?: number;
  value?: number;
  cpf?: string;
  name?: string;
  successUrl?: string;
  autoRedirect?: boolean;
  /** Só com `cpf_custom`: gera o link mesmo que o CPF já tenha assinatura ativa. */
  confirmAdditional?: boolean;
}

/** Código do 409 quando o CPF já tem assinatura ativa (contrato público de `/links`). */
export const HAS_ACTIVE_CONTRIBUTION = 'HAS_ACTIVE_CONTRIBUTION';

interface EventAutoInput {
  eventId: string;
  ticketTypeId: string;
  presetKey?: string;
  fallbackName: string;
}

@Injectable()
export class PaymentLinksOrchestratorService {
  private readonly logger = new Logger(PaymentLinksOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: PaymentLinksGenerationService,
  ) {}

  async createOrReusePublicCotasLink(tenant: Tenant, input: PublicCotasInput) {
    const mode = input.reuseMode ?? 'preset_global';
    const resolved = await this.resolvePublicCotasData(tenant, input, mode);

    if (resolved.reuseMode === 'cpf_custom' && resolved.cpf) {
      if (input.confirmAdditional !== true) {
        await this.assertNoActiveContribution(tenant.id, resolved.cpf);
      }
    }

    const reuseKey = this.buildReuseKey(tenant.id, resolved, {
      mode: resolved.reuseMode,
      presetKey: input.presetKey ?? null,
    });
    const result = await this.createOrReuse(tenant, resolved, reuseKey);

    if (resolved.reuseMode === 'cpf_custom' && resolved.cpf) {
      await this.deactivateOtherCpfLinks(tenant, resolved.cpf, result.id);
    }
    return result;
  }

  /**
   * 409 `HAS_ACTIVE_CONTRIBUTION` quando o perfil do pagador (tenant + CPF) tem
   * assinatura `ACTIVE`. O corpo leva só o e-mail mascarado.
   */
  private async assertNoActiveContribution(tenantId: string, cpf: string) {
    const profile = await this.prisma.financialPayerProfile.findUnique({
      where: { tenantId_cpf: { tenantId, cpf } },
      select: {
        email: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (profile && profile.subscriptions.length > 0) {
      throw new ConflictException({
        code: HAS_ACTIVE_CONTRIBUTION,
        emailHint: maskEmail(profile.email),
      });
    }
  }

  /**
   * Desativa (banco + Asaas) os outros links `CPF_CUSTOM` ativos do CPF, para
   * que só o último gerado continue a aceitar pagamentos. Falha no Asaas só vai
   * para o log. Assinaturas já criadas pelos links antigos não são afetadas.
   */
  private async deactivateOtherCpfLinks(
    tenant: Tenant,
    cpf: string,
    keepProviderLinkId: string,
  ) {
    const others = await this.prisma.financialPaymentLink.findMany({
      where: {
        tenantId: tenant.id,
        mode: toPrismaLinkMode('cpf_custom'),
        cpf,
        active: true,
        providerLinkId: { not: keepProviderLinkId },
      },
      select: { id: true, providerLinkId: true },
    });
    if (others.length === 0) {
      return;
    }
    await this.prisma.financialPaymentLink.updateMany({
      where: { id: { in: others.map((o) => o.id) } },
      data: { active: false },
    });
    for (const link of others) {
      try {
        await this.generation.remove(tenant, link.providerLinkId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Falha ao remover link ${link.providerLinkId} no Asaas (tenant ${tenant.slug}); desativado só no banco: ${message}`,
        );
      }
    }
  }

  private async resolvePublicCotasData(
    tenant: Tenant,
    input: PublicCotasInput,
    mode: 'preset_global' | 'cpf_custom',
  ): Promise<BaseResolvedLinkData> {
    let base: BaseResolvedLinkData;
    if (mode === 'cpf_custom') {
      base = this.resolveCpfCustomData(tenant, input);
    } else if (input.presetKey?.trim()) {
      base = await this.resolvePresetData(tenant, 'cotas', input.presetKey);
    } else {
      base = this.resolveGlobalConfigData(tenant, input);
    }
    return this.normalizeSinglePaymentDuration(base);
  }

  async createOrReuseEventAutoLink(tenant: Tenant, input: EventAutoInput) {
    const ticketType = await this.prisma.eventTicketType.findUnique({
      where: { id: input.ticketTypeId },
    });
    if (!ticketType) {
      throw new NotFoundException('Ingresso não encontrado');
    }

    let resolved: BaseResolvedLinkData;
    if (input.presetKey) {
      resolved = await this.resolvePresetData(
        tenant,
        'events',
        input.presetKey,
        input.fallbackName,
      );
    } else {
      // Tenta achar qualquer preset ativo de eventos do tenant para herdar redirects
      const defaultPreset = await this.prisma.financialLinkPreset.findFirst({
        where: {
          tenantId: tenant.id,
          module: toPrismaFinancialLinkModule('events'),
          active: true,
        },
      });
      resolved = {
        module: 'events',
        sourceKey: `events-${input.eventId}-${input.ticketTypeId}`,
        isMonthly: false,
        successUrl: defaultPreset?.successUrl ?? undefined,
        autoRedirect: defaultPreset?.autoRedirect ?? undefined,
        reuseMode: 'event_auto',
        presetId: defaultPreset?.id,
        asaasLinkName: input.fallbackName || ticketType.name,
      };
    }

    // Alinha o link de pagamento com as configurações reais do ingresso
    resolved.value = fromValueCents(ticketType.priceCents);

    let billingType: AsaasPaymentLinkBillingType = 'UNDEFINED';
    if (ticketType.allowedBillingTypes.length === 1) {
      const type = ticketType.allowedBillingTypes[0];
      if (type === 'PIX' || type === 'BOLETO' || type === 'CREDIT_CARD') {
        billingType = type;
      }
    }

    const endDate = ticketType.salesClosesAt
      ? ticketType.salesClosesAt.toISOString().split('T')[0]
      : undefined;

    const maxInstallmentCount =
      ticketType.allowedBillingTypes.includes('CREDIT_CARD') && ticketType.maxInstallments
        ? ticketType.maxInstallments
        : undefined;

    const eventResolved: BaseResolvedLinkData = this.normalizeSinglePaymentDuration({
      ...resolved,
      reuseMode: 'event_auto',
      sourceKey: `events-${input.eventId}-${input.ticketTypeId}`,
      asaasLinkName: `${resolved.asaasLinkName} - ingresso ${ticketType.name}`,
      billingType,
      maxInstallmentCount,
      endDate,
    });

    const reuseKey = this.buildReuseKey(tenant.id, eventResolved, {
      mode: 'event_auto',
      eventId: input.eventId,
      ticketTypeId: input.ticketTypeId,
      // Garante que qualquer alteração de preço, formas de pagamento, parcelamento ou data recrie o link
      allowedBillingTypes: ticketType.allowedBillingTypes.join(','),
      maxInstallments: ticketType.maxInstallments,
      salesClosesAt: ticketType.salesClosesAt?.toISOString() ?? null,
    });

    return this.createOrReuse(tenant, eventResolved, reuseKey);
  }

  private async createOrReuse(
    tenant: Tenant,
    data: BaseResolvedLinkData,
    reuseKey: string,
  ) {
    const existing = await this.prisma.financialPaymentLink.findUnique({
      where: {
        tenantId_reuseKey: {
          tenantId: tenant.id,
          reuseKey,
        },
      },
    });

    if (existing?.active) {
      const legacyRecurrentOneMonth =
        isLegacyWrongOneMonthRecurrentLink(existing) &&
        !data.isMonthly;
      if (!legacyRecurrentOneMonth) {
        return {
          id: existing.providerLinkId,
          url: existing.url,
          metadata: {
            source: existing.sourceKey,
            tenant: tenant.slug,
            reused: true,
          },
        };
      }
      await this.prisma.financialPaymentLink.update({
        where: { id: existing.id },
        data: { active: false },
      });
    }

    const created = await this.generation.create(tenant, {
      isMonthly: data.isMonthly,
      value: data.value,
      subscriptionDurationMonths: data.subscriptionDurationMonths,
      sourceKey: data.sourceKey,
      asaasLinkName: data.asaasLinkName,
      successUrl: data.successUrl,
      autoRedirect: data.autoRedirect,
      billingType: data.billingType,
      maxInstallmentCount: data.maxInstallmentCount,
      endDate: data.endDate,
    });

    const persistData: Prisma.FinancialPaymentLinkUncheckedCreateInput = {
      tenantId: tenant.id,
      presetId: data.presetId ?? null,
      provider: 'asaas',
      providerLinkId: created.id,
      url: created.url,
      module: toPrismaFinancialLinkModule(data.module),
      sourceKey: data.sourceKey,
      mode: toPrismaLinkMode(data.reuseMode),
      reuseKey,
      cpf: data.cpf ?? null,
      payerName: data.payerName ?? null,
      isMonthly: data.isMonthly,
      subscriptionDurationMonths: data.subscriptionDurationMonths ?? null,
      valueCents: toValueCents(data.value),
      successUrl: data.successUrl ?? null,
      autoRedirect: data.successUrl ? data.autoRedirect : null,
      active: true,
    };

    if (existing) {
      // Mesmo reuseKey de um link desativado (ex.: o CPF trocou de valor e voltou):
      // reaproveita a linha com o novo link do Asaas — `reuseKey` é único por tenant.
      const { tenantId: _t, reuseKey: _r, ...updateData } = persistData;
      await this.prisma.financialPaymentLink.update({
        where: { id: existing.id },
        data: { ...updateData, createdAt: new Date() },
      });
      return {
        ...created,
        metadata: {
          ...created.metadata,
          reused: false,
        },
      };
    }

    try {
      await this.prisma.financialPaymentLink.create({ data: persistData });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.financialPaymentLink.findUnique({
          where: {
            tenantId_reuseKey: { tenantId: tenant.id, reuseKey },
          },
        });
        if (raced) {
          return {
            id: raced.providerLinkId,
            url: raced.url,
            metadata: {
              source: raced.sourceKey,
              tenant: tenant.slug,
              reused: true,
            },
          };
        }
      }
      throw error;
    }

    return {
      ...created,
      metadata: {
        ...created.metadata,
        reused: false,
      },
    };
  }

  private async resolvePresetData(
    tenant: Tenant,
    module: FinancialLinkModule,
    presetKey?: string,
    fallbackName?: string,
  ): Promise<BaseResolvedLinkData> {
    const key = presetKey?.trim().toLowerCase();
    if (!key) {
      throw new NotFoundException(
        'presetKey é obrigatório para reutilizar link por preset',
      );
    }
    const preset = await this.prisma.financialLinkPreset.findUnique({
      where: {
        tenantId_module_presetKey: {
          tenantId: tenant.id,
          module: toPrismaFinancialLinkModule(module),
          presetKey: key,
        },
      },
    });
    if (!preset || !preset.active) {
      throw new NotFoundException('Preset de link não encontrado ou inativo');
    }
    const cleanName = normalizeMaybe(fallbackName) ?? preset.name;
    return {
      module,
      sourceKey: preset.sourceKey,
      isMonthly: preset.isMonthly,
      subscriptionDurationMonths: preset.subscriptionDurationMonths ?? undefined,
      value: fromValueCents(preset.valueCents),
      successUrl: preset.successUrl ?? undefined,
      autoRedirect: preset.autoRedirect ?? undefined,
      reuseMode: 'preset_global',
      presetId: preset.id,
      asaasLinkName: cleanName,
    };
  }

  private resolveCpfCustomData(
    tenant: Tenant,
    input: PublicCotasInput,
  ): BaseResolvedLinkData {
    const cpf = normalizeCpf(input.cpf ?? '');
    const payerName = normalizeMaybe(input.name);
    return {
      module: 'cotas',
      sourceKey: PAYMENT_LINK_SOURCE_COTAS,
      isMonthly: input.isMonthly ?? false,
      subscriptionDurationMonths: input.subscriptionDurationMonths,
      value: input.value,
      successUrl: normalizeMaybe(input.successUrl) ?? undefined,
      autoRedirect: input.autoRedirect,
      reuseMode: 'cpf_custom',
      cpf,
      payerName: payerName ?? undefined,
      asaasLinkName: `Cotas - ${tenant.name} - ${payerName ?? cpf}`,
    };
  }

  private resolveGlobalConfigData(
    tenant: Tenant,
    input: PublicCotasInput,
  ): BaseResolvedLinkData {
    return {
      module: 'cotas',
      sourceKey: PAYMENT_LINK_SOURCE_COTAS,
      isMonthly: input.isMonthly ?? false,
      subscriptionDurationMonths: input.subscriptionDurationMonths,
      value: input.value,
      successUrl: normalizeMaybe(input.successUrl) ?? undefined,
      autoRedirect: input.autoRedirect,
      reuseMode: 'preset_global',
      asaasLinkName: `Cotas - ${tenant.name}`,
    };
  }

  private normalizeSinglePaymentDuration(
    data: BaseResolvedLinkData,
  ): BaseResolvedLinkData {
    return normalizeSinglePaymentCharge(data);
  }

  private buildReuseKey(
    tenantId: string,
    data: BaseResolvedLinkData,
    extra: Record<string, string | number | null>,
  ) {
    return buildReuseKey({
      tenantId,
      module: data.module,
      mode: data.reuseMode,
      sourceKey: data.sourceKey,
      cpf: data.cpf ?? null,
      isMonthly: data.isMonthly,
      subscriptionDurationMonths: data.subscriptionDurationMonths ?? null,
      valueCents: toValueCents(data.value),
      successUrl: data.successUrl ?? null,
      autoRedirect: data.autoRedirect ?? null,
      ...extra,
    });
  }
}
