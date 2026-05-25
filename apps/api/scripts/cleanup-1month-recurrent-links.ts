/**
 * Limpa legado "mensal + 1 mês" que gerou RECURRENT no Asaas:
 * - DELETE do payment link no Asaas (se ainda existir)
 * - active = false na BD (a migration também desactiva links activos no deploy)
 * - PUT endDate na assinatura Asaas (1 período) para parar cobranças futuras
 *
 * Host (DATABASE_URL com 127.0.0.1:5438 no dev, se Postgres exposto):
 *   DATABASE_URL="postgresql://..." npm run script:cleanup-1month-recurrent-links -- --dry-run
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AsaasClient } from '../src/modules/financial/asaas/asaas.client';
import { TenantCredentialsService } from '../src/modules/tenants/tenant-credentials.service';
import { computeSubscriptionEndDateYmd } from '../src/modules/financial/payment-link-subscription-end';

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

    const linkIds = new Set(rows.map((r) => r.providerLinkId));
    const subscriptionEnds = new Map<
      string,
      {
        tenantId: string;
        subscriptionId: string;
        apiKey: string;
        endDate: string;
        paymentLink: string;
      }
    >();

    if (linkIds.size > 0) {
      const txs = await prisma.financialTransaction.findMany({
        where: {
          tenantId: { in: [...new Set(rows.map((r) => r.tenantId))] },
        },
        select: {
          tenantId: true,
          rawPayloadRef: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const tx of txs) {
        const meta = readMeta(tx.rawPayloadRef);
        const subId = meta.asaasSubscriptionId;
        const linkId = meta.asaasPaymentLinkId;
        if (!subId || !linkId || !linkIds.has(linkId)) {
          continue;
        }
        const row = rows.find((r) => r.providerLinkId === linkId);
        if (!row?.tenant.asaasApiKey) {
          continue;
        }
        const endDate = computeSubscriptionEndDateYmd(1, tx.createdAt);
        const key = `${row.tenantId}|${subId}`;
        if (!subscriptionEnds.has(key)) {
          subscriptionEnds.set(key, {
            tenantId: row.tenantId,
            subscriptionId: subId,
            apiKey: credentials.getDecryptedApiKey(row.tenant.asaasApiKey),
            endDate,
            paymentLink: linkId,
          });
        }
      }
    }

    let removedAsaas = 0;
    let markedInactive = 0;
    let subscriptionsUpdated = 0;
    let failures = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const { tenant } = row;
      if (!tenant.asaasApiKey) {
        failures++;
        details.push({
          linkRowId: row.id,
          providerLinkId: row.providerLinkId,
          status: 'skipped_no_api_key',
        });
        continue;
      }

      if (dryRun) {
        details.push({
          providerLinkId: row.providerLinkId,
          active: row.active,
          status: 'dry_run_link',
        });
        continue;
      }

      try {
        const apiKey = credentials.getDecryptedApiKey(tenant.asaasApiKey);
        await asaas.deletePaymentLink({
          apiKey,
          linkId: row.providerLinkId,
        });
        removedAsaas++;
      } catch (e) {
        console.warn(
          `Asaas DELETE link (${row.providerLinkId}):`,
          e instanceof Error ? e.message : e,
        );
      }

      if (row.active) {
        await prisma.financialPaymentLink.update({
          where: { id: row.id },
          data: { active: false },
        });
        markedInactive++;
      }
    }

    for (const entry of subscriptionEnds.values()) {
      if (dryRun) {
        details.push({
          subscription: entry.subscriptionId,
          paymentLink: entry.paymentLink,
          endDate: entry.endDate,
          status: 'dry_run_subscription',
        });
        continue;
      }
      try {
        await asaas.updateSubscription({
          apiKey: entry.apiKey,
          subscriptionId: entry.subscriptionId,
          body: { endDate: entry.endDate },
        });
        subscriptionsUpdated++;
        details.push({
          subscription: entry.subscriptionId,
          paymentLink: entry.paymentLink,
          endDate: entry.endDate,
          status: 'subscription_end_date_set',
        });
      } catch (e) {
        failures++;
        details.push({
          subscription: entry.subscriptionId,
          paymentLink: entry.paymentLink,
          status: 'subscription_failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          linksFound: rows.length,
          subscriptionCandidates: subscriptionEnds.size,
          removedAsaasOk: removedAsaas,
          markedInactive,
          subscriptionsUpdated,
          failures,
          details,
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
