import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCpf, isValidCpfDigits } from '../../common/cpf';
import { TenantCredentialsService } from '../tenants/tenant-credentials.service';
import { AsaasClient } from './asaas/asaas.client';
import { AsaasSubscriptionDurationSyncService } from './asaas-subscription-duration-sync.service';
import type { AsaasCustomerResponse } from './asaas/asaas.types';
import { buildWebhookIdempotencyKey } from './asaas-webhook-idempotency';
import { parsePaymentLinkExternalReference } from './payment-link-external-reference';
import {
  paymentAsaasMetaPatch,
  type AsaasPaymentWebhookFields,
} from './asaas-payment-meta.patch';

/** Payload webhook Asaas v3 (campos usados pelo handler). */
export interface AsaasWebhookBody {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    customer?: string;
    externalReference?: string;
    billingType?: string;
    subscription?: string;
    description?: string;
    paymentLink?: string;
    installmentNumber?: number | null;
  };
  subscription?: {
    id?: string;
    customer?: string;
  };
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

function mergeRawPayloadRef(
  current: Prisma.JsonValue | null | undefined,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    current !== null &&
    current !== undefined &&
    typeof current === 'object' &&
    !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

function paymentSourcePatch(
  externalReference: string | undefined,
): Record<string, unknown> {
  if (!externalReference?.trim()) {
    return {};
  }
  const parsed = parsePaymentLinkExternalReference(externalReference.trim());
  if (parsed) {
    return {
      linkTracking: {
        tenantSlug: parsed.tenantSlug,
        sourceKey: parsed.sourceKey,
      },
    };
  }
  return { asaasPaymentExternalReference: externalReference };
}

function buildPaymentRawPayloadPatch(
  externalReference: string | undefined,
  payment: AsaasWebhookBody['payment'] | undefined,
): Record<string, unknown> {
  return {
    ...paymentSourcePatch(externalReference),
    ...paymentAsaasMetaPatch(payment as AsaasPaymentWebhookFields | undefined),
  };
}

@Injectable()
export class AsaasWebhookService {
  private readonly logger = new Logger(AsaasWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCredentials: TenantCredentialsService,
    private readonly asaas: AsaasClient,
    private readonly subscriptionDurationSync: AsaasSubscriptionDurationSyncService,
  ) {}

  verifyToken(
    headerToken: string | undefined,
    encryptedToken: string | null,
  ): void {
    if (!encryptedToken) {
      throw new UnauthorizedException('Webhook não configurado');
    }
    const expected = this.tenantCredentials.getDecryptedWebhookToken(
      encryptedToken,
    );
    if (headerToken !== expected) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async processRawBody(
    raw: unknown,
    idempotencyKeyFromHeader: string | undefined,
    tenant: Tenant,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const body = raw as AsaasWebhookBody;
    const tenantId = tenant.id;
    const eventType = body.event ?? 'UNKNOWN';

    const idempotencyKey = buildWebhookIdempotencyKey(
      tenantId,
      idempotencyKeyFromHeader,
      body,
    );

    const existing = await this.prisma.financialWebhookEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { ok: true, duplicate: true };
    }

    switch (eventType) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        return this.handlePaymentReceivedOrConfirmed(raw, body, tenant, {
          idempotencyKey,
          eventType,
        });
      case 'PAYMENT_CREATED':
        return this.handlePaymentCreated(raw, body, tenant, idempotencyKey);
      case 'SUBSCRIPTION_CREATED':
        return this.handleSubscriptionCreated(raw, body, tenant, idempotencyKey);
      default:
        return this.handleUnknownEvent(raw, body, tenantId, idempotencyKey, eventType);
    }
  }

  private async handlePaymentReceivedOrConfirmed(
    raw: unknown,
    body: AsaasWebhookBody,
    tenant: Tenant,
    ctx: { idempotencyKey: string; eventType: string },
  ): Promise<{ ok: true; duplicate: boolean }> {
    const paymentId = body.payment?.id;
    const customerId = body.payment?.customer;
    if (!paymentId) {
      throw new BadRequestException('Payload sem payment.id');
    }
    if (!customerId) {
      throw new BadRequestException('Payload sem payment.customer');
    }

    const customer = await this.fetchAsaasCustomer(tenant, customerId);

    const shouldConfirm =
      ctx.eventType === 'PAYMENT_RECEIVED' ||
      ctx.eventType === 'PAYMENT_CONFIRMED' ||
      body.payment?.status === 'RECEIVED' ||
      body.payment?.status === 'CONFIRMED';

    const combinedPatch = buildPaymentRawPayloadPatch(
      body.payment?.externalReference,
      body.payment,
    );

    const txOutcome = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.financialWebhookEvent.create({
          data: {
            tenantId: tenant.id,
            idempotencyKey: ctx.idempotencyKey,
            eventType: ctx.eventType,
            paymentId,
            payload: raw as object,
          },
        });
      } catch (e) {
        if (isPrismaUniqueViolation(e)) {
          return 'duplicate' as const;
        }
        throw e;
      }

      const payer = await this.upsertPayerFromAsaasCustomer(
        tx,
        tenant.id,
        customerId,
        customer,
      );

      const internalSubId = body.payment?.subscription?.trim()
        ? await this.syncSubscriptionByAsaasId(
            tx,
            tenant.id,
            customerId,
            body.payment.subscription.trim(),
            payer?.id ?? null,
          )
        : null;

      if (shouldConfirm) {
        const rows = await tx.financialTransaction.findMany({
          where: { tenantId: tenant.id, asaasPaymentId: paymentId },
        });
        for (const row of rows) {
          const nextRef = mergeRawPayloadRef(row.rawPayloadRef, combinedPatch);
          await tx.financialTransaction.update({
            where: { id: row.id },
            data: {
              status: 'CONFIRMED',
              payerProfileId: payer?.id ?? row.payerProfileId,
              subscriptionId: internalSubId ?? row.subscriptionId,
              rawPayloadRef: nextRef,
            },
          });
        }
        if (rows.length === 0) {
          this.logger.warn(
            `Webhook ${ctx.eventType}: sem financial_transactions para payment ${paymentId}`,
          );
        }
      } else if (payer) {
        await tx.financialTransaction.updateMany({
          where: { tenantId: tenant.id, asaasPaymentId: paymentId },
          data: { payerProfileId: payer.id },
        });
      }
      return 'processed' as const;
    });

    if (txOutcome === 'duplicate') {
      return { ok: true, duplicate: true };
    }
    await this.maybeSyncSubscriptionEndFromPayment(tenant, body.payment);
    return { ok: true, duplicate: false };
  }

  private async handlePaymentCreated(
    raw: unknown,
    body: AsaasWebhookBody,
    tenant: Tenant,
    idempotencyKey: string,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const paymentId = body.payment?.id;
    const customerId = body.payment?.customer;
    if (!paymentId) {
      throw new BadRequestException('Payload sem payment.id');
    }
    if (!customerId) {
      throw new BadRequestException('Payload sem payment.customer');
    }

    const customer = await this.fetchAsaasCustomer(tenant, customerId);
    const value = body.payment?.value;
    const amountCents =
      value !== undefined && value !== null
        ? Math.round(Number(value) * 100)
        : 0;
    const billingType = body.payment?.billingType ?? 'UNDEFINED';
    const combinedPatch = buildPaymentRawPayloadPatch(
      body.payment?.externalReference,
      body.payment,
    );

    const txOutcome = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.financialWebhookEvent.create({
          data: {
            tenantId: tenant.id,
            idempotencyKey,
            eventType: 'PAYMENT_CREATED',
            paymentId,
            payload: raw as object,
          },
        });
      } catch (e) {
        if (isPrismaUniqueViolation(e)) {
          return 'duplicate' as const;
        }
        throw e;
      }

      const payer = await this.upsertPayerFromAsaasCustomer(
        tx,
        tenant.id,
        customerId,
        customer,
      );

      const internalSubId = body.payment?.subscription?.trim()
        ? await this.syncSubscriptionByAsaasId(
            tx,
            tenant.id,
            customerId,
            body.payment.subscription.trim(),
            payer?.id ?? null,
          )
        : null;

      const existing = await tx.financialTransaction.findFirst({
        where: { tenantId: tenant.id, asaasPaymentId: paymentId },
      });

      if (existing) {
        const nextRef = mergeRawPayloadRef(existing.rawPayloadRef, combinedPatch);
        await tx.financialTransaction.update({
          where: { id: existing.id },
          data: {
            payerProfileId: payer?.id ?? existing.payerProfileId,
            subscriptionId: internalSubId ?? existing.subscriptionId,
            rawPayloadRef: nextRef,
          },
        });
        return;
      }

      await tx.financialTransaction.create({
        data: {
          tenantId: tenant.id,
          asaasPaymentId: paymentId,
          payerProfileId: payer?.id ?? null,
          subscriptionId: internalSubId,
          type: 'PAYMENT_CREATED',
          amountCents,
          status: 'PENDING',
          billingType,
          rawPayloadRef: mergeRawPayloadRef(null, combinedPatch),
        },
      });
      return 'processed' as const;
    });

    if (txOutcome === 'duplicate') {
      return { ok: true, duplicate: true };
    }
    await this.maybeSyncSubscriptionEndFromPayment(tenant, body.payment);
    return { ok: true, duplicate: false };
  }

  private async handleSubscriptionCreated(
    raw: unknown,
    body: AsaasWebhookBody,
    tenant: Tenant,
    idempotencyKey: string,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const customerId = body.subscription?.customer;
    if (!customerId) {
      throw new BadRequestException('Payload sem subscription.customer');
    }

    const customer = await this.fetchAsaasCustomer(tenant, customerId);
    const subscriptionId = body.subscription?.id ?? null;

    const txOutcome = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.financialWebhookEvent.create({
          data: {
            tenantId: tenant.id,
            idempotencyKey,
            eventType: 'SUBSCRIPTION_CREATED',
            paymentId: subscriptionId,
            payload: raw as object,
          },
        });
      } catch (e) {
        if (isPrismaUniqueViolation(e)) {
          return 'duplicate' as const;
        }
        throw e;
      }

      const payer = await this.upsertPayerFromAsaasCustomer(
        tx,
        tenant.id,
        customerId,
        customer,
      );
      const asaasSubId = subscriptionId?.trim();
      if (asaasSubId) {
        await this.syncSubscriptionByAsaasId(
          tx,
          tenant.id,
          customerId,
          asaasSubId,
          payer?.id ?? null,
        );
      }
      return 'processed' as const;
    });

    if (txOutcome === 'duplicate') {
      return { ok: true, duplicate: true };
    }
    return { ok: true, duplicate: false };
  }

  /**
   * Após checkout via link RECURRENT, o Asaas cria assinatura sem "data de fim" no painel;
   * alinha com `subscriptionDurationMonths` do link guardado em `financial_payment_links`.
   */
  private async maybeSyncSubscriptionEndFromPayment(
    tenant: Tenant,
    payment: AsaasWebhookBody['payment'] | undefined,
  ): Promise<void> {
    const subId = payment?.subscription?.trim();
    const linkId = payment?.paymentLink?.trim();
    if (!subId || !linkId) {
      return;
    }
    try {
      await this.subscriptionDurationSync.applyFromPaymentLink(
        tenant,
        subId,
        linkId,
      );
    } catch (e) {
      this.logger.warn(
        `Sync endDate assinatura ${subId} ignorado (retry Asaas): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Eventos não mapeados: apenas dedup na tabela de webhooks (sem GET Asaas). */
  private async handleUnknownEvent(
    raw: unknown,
    body: AsaasWebhookBody,
    tenantId: string,
    idempotencyKey: string,
    eventType: string,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const txOutcome = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.financialWebhookEvent.create({
          data: {
            tenantId,
            idempotencyKey,
            eventType,
            paymentId: body.payment?.id ?? body.subscription?.id ?? null,
            payload: raw as object,
          },
        });
      } catch (e) {
        if (isPrismaUniqueViolation(e)) {
          return 'duplicate' as const;
        }
        throw e;
      }
      return 'processed' as const;
    });
    if (txOutcome === 'duplicate') {
      return { ok: true, duplicate: true };
    }
    return { ok: true, duplicate: false };
  }

  /**
   * Garante `financial_subscriptions` para um `sub_…` do Asaas, usando o primeiro
   * `financial_plans` activo do tenant como plano de referência (MVP).
   */
  private async syncSubscriptionByAsaasId(
    tx: Prisma.TransactionClient,
    tenantId: string,
    asaasCustomerId: string,
    asaasSubscriptionId: string,
    payerProfileId: string | null,
  ): Promise<string | null> {
    const trimmed = asaasSubscriptionId.trim();
    if (!trimmed) {
      return null;
    }

    const plan = await tx.financialPlan.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!plan) {
      this.logger.warn(
        `Tenant ${tenantId}: sem financial_plans activos; não persiste assinatura Asaas ${trimmed}`,
      );
      return null;
    }

    const row = await tx.financialSubscription.upsert({
      where: { asaasSubscriptionId: trimmed },
      create: {
        tenantId,
        planId: plan.id,
        payerProfileId,
        asaasCustomerId,
        asaasSubscriptionId: trimmed,
        status: 'ACTIVE',
      },
      update: {
        ...(payerProfileId ? { payerProfileId } : {}),
        status: 'ACTIVE',
      },
    });
    return row.id;
  }

  private async fetchAsaasCustomer(
    tenant: Tenant,
    customerId: string,
  ): Promise<AsaasCustomerResponse> {
    if (!tenant.asaasApiKey) {
      throw new BadRequestException('Igreja sem API key Asaas configurada');
    }
    const apiKey = this.tenantCredentials.getDecryptedApiKey(tenant.asaasApiKey);
    return this.asaas.getCustomer({ apiKey, customerId });
  }

  /**
   * Prioridade: match por asaasCustomerId, depois por CPF.
   * Apenas CPF com 11 dígitos válidos (CNPJ / dados incompletos → null, com log).
   */
  private async upsertPayerFromAsaasCustomer(
    tx: Prisma.TransactionClient,
    tenantId: string,
    asaasCustomerId: string,
    c: AsaasCustomerResponse,
  ): Promise<{ id: string } | null> {
    const cpfDigits = c.cpfCnpj?.replace(/\D/g, '') ?? '';
    if (cpfDigits.length !== 11) {
      this.logger.warn(
        `Cliente Asaas ${asaasCustomerId}: documento não é CPF 11 dígitos; perfil local omitido`,
      );
      return null;
    }
    let cpf: string;
    try {
      cpf = normalizeCpf(cpfDigits);
    } catch {
      return null;
    }
    if (!isValidCpfDigits(cpf)) {
      this.logger.warn(
        `Cliente Asaas ${asaasCustomerId}: CPF inválido; perfil local omitido`,
      );
      return null;
    }

    const email = (c.email ?? '').trim().toLowerCase();
    const name = (c.name ?? '').trim();
    if (!email || !name) {
      this.logger.warn(
        `Cliente Asaas ${asaasCustomerId}: nome ou email ausente; perfil local omitido`,
      );
      return null;
    }

    const phoneRaw = c.phone ?? c.mobilePhone;
    const phone = phoneRaw
      ? phoneRaw.replace(/\D/g, '').slice(0, 20)
      : null;

    let profile = await tx.financialPayerProfile.findFirst({
      where: { tenantId, asaasCustomerId },
    });
    if (!profile) {
      profile = await tx.financialPayerProfile.findFirst({
        where: { tenantId, cpf },
      });
    }

    if (profile) {
      const updated = await tx.financialPayerProfile.update({
        where: { id: profile.id },
        data: {
          name,
          email,
          phone: phone || profile.phone,
          asaasCustomerId: profile.asaasCustomerId ?? asaasCustomerId,
        },
      });
      return { id: updated.id };
    }

    const created = await tx.financialPayerProfile.create({
      data: {
        tenantId,
        cpf,
        name,
        email,
        phone,
        asaasCustomerId,
      },
    });
    return { id: created.id };
  }
}
