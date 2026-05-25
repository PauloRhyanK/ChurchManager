/**
 * Corrige assinaturas Asaas antigas sem "data de fim" no painel.
 * O endDate no payment link não é copiado para a assinatura — este script faz PUT /subscriptions/{id}.
 *
 * Origem dos pares (subscription + paymentLink):
 *   - financial_transactions.raw_payload_ref (webhooks PAYMENT_*)
 *   - financial_subscriptions.asaas_subscription_id + transacções do mesmo tenant
 *
 * A data de referência para calcular endDate é a mais antiga entre:
 *   primeira transação do par, createdAt da assinatura local, createdAt do link.
 *
 * Executar em apps/api (lê ../../.env como o Nest):
 *
 *   npx tsx scripts/backfill-subscription-end-dates.ts --dry-run
 *   npx tsx scripts/backfill-subscription-end-dates.ts
 *
 * Opcional: --tenant=demo  (só um slug)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AsaasSubscriptionDurationSyncService } from '../src/modules/financial/asaas-subscription-duration-sync.service';

type PairKey = string;

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const tenantSlug = argv
    .find((a) => a.startsWith('--tenant='))
    ?.split('=')[1]
    ?.trim();
  return { dryRun, tenantSlug };
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
  const { dryRun, tenantSlug } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const sync = app.get(AsaasSubscriptionDurationSyncService);

    const tenants = await prisma.tenant.findMany({
      where: tenantSlug ? { slug: tenantSlug } : undefined,
      select: {
        id: true,
        slug: true,
        name: true,
        asaasApiKey: true,
        asaasWebhookToken: true,
        paymentSuccessRedirectUrl: true,
        paymentSuccessRedirectEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (tenantSlug && tenants.length === 0) {
      throw new Error(`Tenant slug não encontrado: ${tenantSlug}`);
    }

    const pairs = new Map<
      PairKey,
      {
        tenantId: string;
        asaasSubscriptionId: string;
        asaasPaymentLinkId: string;
        referenceDate: Date;
      }
    >();

    for (const tenant of tenants) {
      const txs = await prisma.financialTransaction.findMany({
        where: { tenantId: tenant.id },
        select: {
          rawPayloadRef: true,
          createdAt: true,
          subscription: {
            select: { asaasSubscriptionId: true, createdAt: true },
          },
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
        if (!subId || !linkId) {
          continue;
        }

        const key = `${tenant.id}|${subId}|${linkId}`;
        const ref = tx.createdAt;
        const existing = pairs.get(key);
        if (!existing || ref < existing.referenceDate) {
          pairs.set(key, {
            tenantId: tenant.id,
            asaasSubscriptionId: subId,
            asaasPaymentLinkId: linkId,
            referenceDate: ref,
          });
        }
      }

      const subs = await prisma.financialSubscription.findMany({
        where: {
          tenantId: tenant.id,
          asaasSubscriptionId: { not: null },
        },
        select: {
          asaasSubscriptionId: true,
          createdAt: true,
          transactions: {
            select: { rawPayloadRef: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: 20,
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
          const linkId = meta.asaasPaymentLinkId;
          if (!linkId) {
            continue;
          }
          const key = `${tenant.id}|${subId}|${linkId}`;
          const ref = tx.createdAt < sub.createdAt ? tx.createdAt : sub.createdAt;
          const existing = pairs.get(key);
          if (!existing || ref < existing.referenceDate) {
            pairs.set(key, {
              tenantId: tenant.id,
              asaasSubscriptionId: subId,
              asaasPaymentLinkId: linkId,
              referenceDate: ref,
            });
          }
        }
      }
    }

    const tenantById = new Map(tenants.map((t) => [t.id, t]));
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const pair of pairs.values()) {
      const tenant = tenantById.get(pair.tenantId);
      if (!tenant?.asaasApiKey) {
        skipped++;
        details.push({
          ...pair,
          status: 'skipped_no_api_key',
        });
        continue;
      }

      if (dryRun) {
        const link = await prisma.financialPaymentLink.findFirst({
          where: {
            tenantId: pair.tenantId,
            providerLinkId: pair.asaasPaymentLinkId,
          },
          select: {
            subscriptionDurationMonths: true,
            isMonthly: true,
          },
        });
        details.push({
          tenant: tenant.slug,
          subscription: pair.asaasSubscriptionId,
          paymentLink: pair.asaasPaymentLinkId,
          referenceDate: pair.referenceDate.toISOString(),
          months: link?.subscriptionDurationMonths,
          isMonthly: link?.isMonthly,
          status: 'dry_run',
        });
        continue;
      }

      try {
        const result = await sync.applyFromPaymentLink(
          tenant,
          pair.asaasSubscriptionId,
          pair.asaasPaymentLinkId,
          { referenceDate: pair.referenceDate },
        );
        if (result.applied) {
          applied++;
          details.push({
            tenant: tenant.slug,
            subscription: pair.asaasSubscriptionId,
            paymentLink: pair.asaasPaymentLinkId,
            endDate: result.endDate,
            months: result.months,
            status: 'applied',
          });
        } else {
          skipped++;
          details.push({
            tenant: tenant.slug,
            subscription: pair.asaasSubscriptionId,
            paymentLink: pair.asaasPaymentLinkId,
            status: 'skipped_not_eligible',
          });
        }
      } catch (e) {
        failed++;
        details.push({
          tenant: tenant.slug,
          subscription: pair.asaasSubscriptionId,
          paymentLink: pair.asaasPaymentLinkId,
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          tenantSlug: tenantSlug ?? null,
          pairsFound: pairs.size,
          applied,
          skipped,
          failed,
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
