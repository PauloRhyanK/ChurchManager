/**
 * Limpa legado "mensal + 1 mês" (RECURRENT no Asaas). Prioridade: assinatura.
 *
 * Por assinatura encontrada:
 *   1) Mantém só a primeira cobrança (paga ou mais antiga por vencimento)
 *   2) Cancela cobranças extras pendentes/vencidas (DELETE /payments)
 *   3) Estorna cobranças extras já recebidas (POST /payments/{id}/refund)
 *   4) Encerra a assinatura (DELETE /subscriptions; fallback PUT endDate)
 *
 * Também: active=false na BD; tenta DELETE do payment link (pode falhar se já houve cobrança).
 *
 * Host:
 *   DATABASE_URL="postgresql://..." npm run script:cleanup-1month-recurrent-links -- --dry-run
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AsaasClient } from '../src/modules/financial/asaas/asaas.client';
import { TenantCredentialsService } from '../src/modules/tenants/tenant-credentials.service';
import { computeSubscriptionEndDateYmd } from '../src/modules/financial/payment-link-subscription-end';
import { repairLegacySubscription } from './lib/repair-legacy-subscription';
import type { FinancialPaymentLink, Tenant } from '@prisma/client';

function parseArgs(argv: string[]) {
  return { dryRun: argv.includes('--dry-run') };
}

function readMeta(raw: unknown): {
  asaasSubscriptionId?: string;
  asaasPaymentLinkId?: string;
} {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const sub =
    typeof o.asaasSubscriptionId === 'string'
      ? o.asaasSubscriptionId.trim()
      : undefined;
  const link =
    typeof o.asaasPaymentLinkId === 'string'
      ? o.asaasPaymentLinkId.trim()
      : undefined;
  return { asaasSubscriptionId: sub, asaasPaymentLinkId: link };
}

function rawReferencesLinkId(raw: unknown, linkId: string): boolean {
  if (raw === null || raw === undefined) {
    return false;
  }
  try {
    return JSON.stringify(raw).includes(linkId);
  } catch {
    return false;
  }
}

type SubscriptionEndEntry = {
  tenantId: string;
  subscriptionId: string;
  apiKey: string;
  endDate: string;
  paymentLink: string;
  source: string;
  referenceDate: Date;
};

type LegacyLinkRow = FinancialPaymentLink & { tenant: Tenant };

async function collectSubscriptionEnds(
  prisma: PrismaService,
  asaas: AsaasClient,
  credentials: TenantCredentialsService,
  rows: LegacyLinkRow[],
): Promise<Map<string, SubscriptionEndEntry>> {
  const linkIds = new Set(rows.map((r) => r.providerLinkId));
  const rowByLinkId = new Map(rows.map((r) => [r.providerLinkId, r]));
  const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
  const ends = new Map<string, SubscriptionEndEntry>();

  const add = (
    row: LegacyLinkRow,
    subId: string,
    referenceDate: Date,
    source: string,
  ) => {
    if (!row.tenant.asaasApiKey) {
      return;
    }
    const key = `${row.tenantId}|${subId}`;
    const endDate = computeSubscriptionEndDateYmd(1, referenceDate);
    const apiKey = credentials.getDecryptedApiKey(row.tenant.asaasApiKey);
    const existing = ends.get(key);
    if (!existing || referenceDate < existing.referenceDate) {
      ends.set(key, {
        tenantId: row.tenantId,
        subscriptionId: subId,
        apiKey,
        endDate,
        paymentLink: row.providerLinkId,
        source: existing ? `${existing.source}+${source}` : source,
        referenceDate,
      });
    }
  };

  if (linkIds.size === 0) {
    return ends;
  }

  const txs = await prisma.financialTransaction.findMany({
    where: { tenantId: { in: tenantIds } },
    select: {
      tenantId: true,
      rawPayloadRef: true,
      createdAt: true,
      subscription: { select: { asaasSubscriptionId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const tx of txs) {
    const meta = readMeta(tx.rawPayloadRef);
    let subId = meta.asaasSubscriptionId;
    let linkId = meta.asaasPaymentLinkId;
    if (!subId && tx.subscription?.asaasSubscriptionId) {
      subId = tx.subscription.asaasSubscriptionId.trim();
    }
    if (!linkId) {
      for (const lid of linkIds) {
        if (rawReferencesLinkId(tx.rawPayloadRef, lid)) {
          linkId = lid;
          break;
        }
      }
    }
    if (!subId || !linkId || !linkIds.has(linkId)) {
      continue;
    }
    const row = rowByLinkId.get(linkId);
    if (!row) {
      continue;
    }
    add(row, subId, tx.createdAt, 'transaction');
  }

  const subs = await prisma.financialSubscription.findMany({
    where: {
      tenantId: { in: tenantIds },
      asaasSubscriptionId: { not: null },
    },
    select: {
      tenantId: true,
      asaasSubscriptionId: true,
      createdAt: true,
      transactions: {
        select: { rawPayloadRef: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
  });

  for (const sub of subs) {
    const subId = sub.asaasSubscriptionId?.trim();
    if (!subId) {
      continue;
    }
    for (const tx of sub.transactions) {
      const meta = readMeta(tx.rawPayloadRef);
      let linkId = meta.asaasPaymentLinkId;
      if (!linkId) {
        for (const lid of linkIds) {
          if (rawReferencesLinkId(tx.rawPayloadRef, lid)) {
            linkId = lid;
            break;
          }
        }
      }
      if (!linkId || !linkIds.has(linkId)) {
        continue;
      }
      const row = rowByLinkId.get(linkId);
      if (!row) {
        continue;
      }
      const ref = tx.createdAt < sub.createdAt ? tx.createdAt : sub.createdAt;
      add(row, subId, ref, 'financial_subscription');
    }
  }

  for (const row of rows) {
    if (!row.tenant.asaasApiKey) {
      continue;
    }
    const hasPairForLink = [...ends.values()].some(
      (e) => e.paymentLink === row.providerLinkId,
    );
    if (hasPairForLink) {
      continue;
    }
    try {
      const apiKey = credentials.getDecryptedApiKey(row.tenant.asaasApiKey);
      const payments = await asaas.listPayments({
        apiKey,
        paymentLink: row.providerLinkId,
        limit: 100,
      });
      for (const p of payments) {
        const subId = p.subscription?.trim();
        if (!subId) {
          continue;
        }
        const ref = p.dueDate ? new Date(`${p.dueDate}T12:00:00`) : row.createdAt;
        add(row, subId, ref, 'asaas_payments_api');
      }
    } catch (e) {
      console.warn(
        `Asaas listPayments (${row.providerLinkId}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return ends;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const asaas = app.get(AsaasClient);
    const credentials = app.get(TenantCredentialsService);

    const rows = await prisma.financialPaymentLink.findMany({
      where: {
        isMonthly: true,
        subscriptionDurationMonths: 1,
      },
      include: { tenant: true },
    });

    const subscriptionEnds = await collectSubscriptionEnds(
      prisma,
      asaas,
      credentials,
      rows,
    );

    const linksWithSubscription = new Set(
      [...subscriptionEnds.values()].map((e) => e.paymentLink),
    );

    let removedAsaas = 0;
    let markedInactive = 0;
    let subscriptionsRepaired = 0;
    let paymentsCanceled = 0;
    let paymentsRefunded = 0;
    let failures = 0;
    const details: Array<Record<string, unknown>> = [];
    const subscriptionRepairs: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const { tenant } = row;
      if (!tenant.asaasApiKey) {
        failures++;
        details.push({
          providerLinkId: row.providerLinkId,
          active: row.active,
          status: 'skipped_no_api_key',
        });
        continue;
      }

      const linkDetail: Record<string, unknown> = {
        providerLinkId: row.providerLinkId,
        active: row.active,
        hasSubscriptionCandidate: linksWithSubscription.has(row.providerLinkId),
      };

      if (dryRun) {
        linkDetail.status = 'dry_run_link';
        details.push(linkDetail);
        continue;
      }

      try {
        const apiKey = credentials.getDecryptedApiKey(tenant.asaasApiKey);
        await asaas.deletePaymentLink({
          apiKey,
          linkId: row.providerLinkId,
        });
        removedAsaas++;
        linkDetail.asaasLinkDeleted = true;
      } catch (e) {
        linkDetail.asaasLinkDeleteError =
          e instanceof Error ? e.message : String(e);
      }

      if (row.active) {
        await prisma.financialPaymentLink.update({
          where: { id: row.id },
          data: { active: false },
        });
        markedInactive++;
        linkDetail.markedInactive = true;
      } else {
        linkDetail.markedInactive = false;
        linkDetail.note = 'já estava inactive na BD';
      }

      if (!linksWithSubscription.has(row.providerLinkId)) {
        linkDetail.status = 'link_processed_no_subscription_found';
        linkDetail.warning =
          'Nenhuma assinatura encontrada (BD nem Asaas). Se já houve pagamento, verifique webhooks/transacções.';
      } else {
        linkDetail.status = 'link_processed';
      }
      details.push(linkDetail);
    }

    for (const entry of subscriptionEnds.values()) {
      const repair = await repairLegacySubscription(asaas, {
        apiKey: entry.apiKey,
        subscriptionId: entry.subscriptionId,
        referenceDate: entry.referenceDate,
        dryRun,
      });
      paymentsCanceled += repair.paymentsCanceled;
      paymentsRefunded += repair.paymentsRefunded;
      if (repair.subscriptionClosed) {
        subscriptionsRepaired++;
      } else if (!dryRun && repair.paymentErrors === 0) {
        failures++;
      }
      subscriptionRepairs.push({
        subscription: entry.subscriptionId,
        paymentLink: entry.paymentLink,
        source: entry.source,
        expectedEndDate: entry.endDate,
        ...repair,
      });
    }

    const linksWithoutSub = rows.filter(
      (r) => !linksWithSubscription.has(r.providerLinkId),
    );

    console.log(
      JSON.stringify(
        {
          dryRun,
          linksFound: rows.length,
          subscriptionCandidates: subscriptionEnds.size,
          linksWithoutSubscription: linksWithoutSub.map((r) => r.providerLinkId),
          removedAsaasOk: removedAsaas,
          markedInactive,
          subscriptionsRepaired,
          paymentsCanceled,
          paymentsRefunded,
          failures,
          details,
          subscriptionRepairs,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
