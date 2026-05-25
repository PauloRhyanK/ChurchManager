import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { normalizeCpf } from '../../common/cpf';
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
}

interface EventAutoInput {
  eventId: string;
  ticketTypeId: string;
  presetKey?: string;
  fallbackName: string;
}

@Injectable()
export class PaymentLinksOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: PaymentLinksGenerationService,
  ) {}

  async createOrReusePublicCotasLink(tenant: Tenant, input: PublicCotasInput) {
    const mode = input.reuseMode ?? 'preset_global';
    const resolved = await this.resolvePublicCotasData(tenant, input, mode);

    const reuseKey = this.buildReuseKey(tenant.id, resolved, {
      mode: resolved.reuseMode,
      presetKey: input.presetKey ?? null,
    });
    return this.createOrReuse(tenant, resolved, reuseKey);
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
    const resolved = await this.resolvePresetData(
      tenant,
      'events',
      input.presetKey,
      input.fallbackName,
    );
    const eventResolved = this.normalizeSinglePaymentDuration({
      ...resolved,
      reuseMode: 'event_auto',
      sourceKey: `events-${input.eventId}-${input.ticketTypeId}`,
      asaasLinkName: `${resolved.asaasLinkName} - ingresso ${input.ticketTypeId}`,
    });
    const reuseKey = this.buildReuseKey(tenant.id, eventResolved, {
      mode: 'event_auto',
      eventId: input.eventId,
      ticketTypeId: input.ticketTypeId,
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
