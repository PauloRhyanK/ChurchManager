import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { maskCpfDigits } from '../../common/mask-cpf';

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

    const items = payers.map((p) => {
      const lastAt = lastPaidMap.get(p.id) ?? null;
      const quotaStatus = this.resolveQuotaStatus(lastAt);
      const sub = subByPayer.get(p.id);
      const planLabelStr = sub?.plan
        ? planLabel(sub.plan.name, sub.plan.amountCents, sub.plan.currency)
        : '—';
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
}
