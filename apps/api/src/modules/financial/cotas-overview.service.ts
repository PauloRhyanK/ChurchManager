import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { maskCpfDigits } from '../../common/mask-cpf';
import { planLabelFromRawPayloadRef } from './asaas-payment-meta.patch';
import { inferSubscriptionMonthsFromDescription } from './infer-subscription-months-from-description';

/** Janela em dias: último pagamento CONFIRMED dentro disto = em dia (MVP). */
export const COTAS_PAID_WINDOW_DAYS = 35;

export type QuotaStatus = 'PAID' | 'OVERDUE' | 'PENDING';

function buildStatusFilter(
  status: QuotaStatus | undefined,
): Prisma.Sql {
  if (!status) {
    return Prisma.empty;
  }
  const days = COTAS_PAID_WINDOW_DAYS;
  switch (status) {
    case 'PENDING':
      return Prisma.sql`AND lc.last_at IS NULL`;
    case 'PAID':
      return Prisma.sql`AND lc.last_at IS NOT NULL AND lc.last_at >= (NOW() AT TIME ZONE 'UTC' - (${days} * INTERVAL '1 day'))`;
    case 'OVERDUE':
      return Prisma.sql`AND lc.last_at IS NOT NULL AND lc.last_at < (NOW() AT TIME ZONE 'UTC' - (${days} * INTERVAL '1 day'))`;
    default:
      return Prisma.empty;
  }
}

/** Escapa % e _ para uso em ILIKE com padrão controlado pelo servidor. */
function ilikePattern(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) {
    return '';
  }
  return `%${trimmed.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

function buildSearchFilter(q: string | undefined): Prisma.Sql {
  const pattern = q?.trim() ? ilikePattern(q) : '';
  if (!pattern) {
    return Prisma.empty;
  }
  return Prisma.sql`AND (p.name ILIKE ${pattern} ESCAPE '\\' OR p.email ILIKE ${pattern} ESCAPE '\\')`;
}

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function planLabel(
  name: string,
  amountCents: number,
  currency: string,
): string {
  const cur = currency === 'BRL' ? 'BRL' : currency;
  const amount =
    cur === 'BRL'
      ? moneyFmt.format(amountCents / 100)
      : `${(amountCents / 100).toFixed(2)} ${cur}`;
  return `${name} — ${amount}`;
}

@Injectable()
export class CotasOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveQuotaStatus(lastConfirmedAt: Date | null): QuotaStatus {
    if (!lastConfirmedAt) {
      return 'PENDING';
    }
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - COTAS_PAID_WINDOW_DAYS);
    return lastConfirmedAt >= cutoff ? 'PAID' : 'OVERDUE';
  }

  async listForTenant(
    tenantId: string,
    page: number,
    limit: number,
    status?: QuotaStatus,
    q?: string,
  ) {
    const skip = (page - 1) * limit;
    const statusFilter = buildStatusFilter(status);
    const searchFilter = buildSearchFilter(q);

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM financial_payer_profiles p
      LEFT JOIN (
        SELECT payer_profile_id, MAX(created_at) AS last_at
        FROM financial_transactions
        WHERE tenant_id = ${tenantId}::uuid
          AND status = 'CONFIRMED'
          AND payer_profile_id IS NOT NULL
        GROUP BY payer_profile_id
      ) lc ON lc.payer_profile_id = p.id
      WHERE p.tenant_id = ${tenantId}::uuid
      ${searchFilter}
      ${statusFilter}
      ORDER BY p.name ASC
      LIMIT ${limit}
      OFFSET ${skip}
    `;

    const countRows = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM financial_payer_profiles p
      LEFT JOIN (
        SELECT payer_profile_id, MAX(created_at) AS last_at
        FROM financial_transactions
        WHERE tenant_id = ${tenantId}::uuid
          AND status = 'CONFIRMED'
          AND payer_profile_id IS NOT NULL
        GROUP BY payer_profile_id
      ) lc ON lc.payer_profile_id = p.id
      WHERE p.tenant_id = ${tenantId}::uuid
      ${searchFilter}
      ${statusFilter}
    `;

    const total = Number(countRows[0]?.c ?? 0n);
    const ids = idRows.map((r) => r.id);

    if (ids.length === 0) {
      return { items: [], page, limit, total };
    }

    const payers = await this.prisma.financialPayerProfile.findMany({
      where: { id: { in: ids } },
    });
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    payers.sort((a, b) => orderMap.get(a.id)! - orderMap.get(b.id)!);

    const lastGroups = await this.prisma.financialTransaction.groupBy({
      by: ['payerProfileId'],
      where: {
        tenantId,
        status: 'CONFIRMED',
        payerProfileId: { in: ids },
      },
      _max: { createdAt: true },
    });
    const lastPaidMap = new Map(
      lastGroups
        .filter((g) => g.payerProfileId)
        .map((g) => [g.payerProfileId!, g._max.createdAt]),
    );

    const subs = await this.prisma.financialSubscription.findMany({
      where: { tenantId, payerProfileId: { in: ids } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const subByPayer = new Map<string, (typeof subs)[0]>();
    for (const s of subs) {
      if (s.payerProfileId && !subByPayer.has(s.payerProfileId)) {
        subByPayer.set(s.payerProfileId, s);
      }
    }

    const lastTxRows = await this.prisma.financialTransaction.findMany({
      where: {
        tenantId,
        status: 'CONFIRMED',
        payerProfileId: { in: ids },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        payerProfileId: true,
        rawPayloadRef: true,
        amountCents: true,
      },
    });
    const lastTxByPayer = new Map<
      string,
      { rawPayloadRef: unknown; amountCents: number }
    >();
    for (const row of lastTxRows) {
      if (row.payerProfileId && !lastTxByPayer.has(row.payerProfileId)) {
        lastTxByPayer.set(row.payerProfileId, {
          rawPayloadRef: row.rawPayloadRef,
          amountCents: row.amountCents,
        });
      }
    }

    const items = payers.map((p) => {
      const lastAt = lastPaidMap.get(p.id) ?? null;
      const quotaStatus = this.resolveQuotaStatus(lastAt);
      const sub = subByPayer.get(p.id);
      const lt = lastTxByPayer.get(p.id);
      const fromPayload =
        lt &&
        planLabelFromRawPayloadRef(lt.rawPayloadRef, lt.amountCents);
      let planLabelStr = '—';
      if (fromPayload) {
        planLabelStr = fromPayload;
      } else if (sub?.plan) {
        planLabelStr = planLabel(
          sub.plan.name,
          sub.plan.amountCents,
          sub.plan.currency,
        );
      }
      return {
        payerProfileId: p.id,
        name: p.name,
        cpfMasked: maskCpfDigits(p.cpf),
        planLabel: planLabelStr,
        quotaStatus,
        lastPaymentAt: lastAt?.toISOString() ?? null,
      };
    });

    return { items, page, limit, total };
  }

  /**
   * Histórico de `financial_transactions` do pagador (webhooks Asaas),
   * com resumo para acompanhamento de mensalidades / parcelas conhecidas.
   */
  async getPayerPaymentHistory(tenantId: string, payerProfileId: string) {
    const payer = await this.prisma.financialPayerProfile.findFirst({
      where: { id: payerProfileId, tenantId },
      select: { id: true, name: true, cpf: true },
    });
    if (!payer) {
      throw new NotFoundException('Pagador não encontrado');
    }

    const txs = await this.prisma.financialTransaction.findMany({
      where: { tenantId, payerProfileId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        amountCents: true,
        status: true,
        billingType: true,
        asaasPaymentId: true,
        rawPayloadRef: true,
      },
    });

    let inferredRecurringTotalMonths: number | null = null;
    let maxInstallmentNumberFromWebhooks: number | null = null;

    for (const t of txs) {
      const raw = t.rawPayloadRef;
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const o = raw as Record<string, unknown>;
      const desc = o.paymentDescription;
      if (typeof desc === 'string') {
        const inf = inferSubscriptionMonthsFromDescription(desc);
        if (inf != null) {
          inferredRecurringTotalMonths =
            inferredRecurringTotalMonths == null
              ? inf
              : Math.max(inferredRecurringTotalMonths, inf);
        }
      }
      const inst = o.installmentNumber;
      if (typeof inst === 'number' && Number.isFinite(inst)) {
        maxInstallmentNumberFromWebhooks =
          maxInstallmentNumberFromWebhooks == null
            ? inst
            : Math.max(maxInstallmentNumberFromWebhooks, inst);
      }
    }

    const items = txs.map((t) => {
      let paymentDescription: string | null = null;
      let installmentNumber: number | null = null;
      const raw = t.rawPayloadRef;
      if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o.paymentDescription === 'string') {
          paymentDescription = o.paymentDescription.trim().slice(0, 500);
        }
        if (typeof o.installmentNumber === 'number') {
          installmentNumber = o.installmentNumber;
        }
      }
      return {
        id: t.id,
        createdAt: t.createdAt.toISOString(),
        amountCents: t.amountCents,
        status: t.status,
        billingType: t.billingType,
        asaasPaymentId: t.asaasPaymentId,
        paymentDescription,
        installmentNumber,
      };
    });

    const confirmedPaymentCount = txs.filter((t) => t.status === 'CONFIRMED')
      .length;

    return {
      payerProfileId: payer.id,
      name: payer.name,
      cpfMasked: maskCpfDigits(payer.cpf),
      summary: {
        confirmedPaymentCount,
        totalRecords: txs.length,
        inferredRecurringTotalMonths,
        maxInstallmentNumberFromWebhooks,
      },
      items,
    };
  }
}
