/**
 * One-shot: remove no Asaas os payment links com configuração antiga (mensal + 1 mês)
 * e marca-os `active = false` na BD para forçar regeneração no próximo pedido.
 *
 * Executar a partir da pasta `apps/api` (variáveis `.env` como no servidor):
 *
 *   npx tsx scripts/cleanup-1month-recurrent-links.ts
 *
 * Idempotente: links já removidos (404 no DELETE) contam como sucesso e são desactivados na BD.
 */
import { NestFactory } from '@nestjs/core';
import { ScriptsAppModule } from '../src/scripts/scripts-app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AsaasClient } from '../src/modules/financial/asaas/asaas.client';
import { TenantCredentialsService } from '../src/modules/tenants/tenant-credentials.service';

async function main() {
  const app = await NestFactory.createApplicationContext(ScriptsAppModule, {
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
        active: true,
      },
      include: { tenant: true },
    });

    let removedAsaas = 0;
    let markedInactive = 0;
    let failures = 0;

    for (const row of rows) {
      const { tenant } = row;
      if (!tenant.asaasApiKey) {
        console.warn(`Ignorado ${row.id}: tenant sem asaasApiKey`);
        failures++;
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
          `Asaas DELETE falhou (${row.providerLinkId}):`,
          e instanceof Error ? e.message : e,
        );
        failures++;
        continue;
      }

      await prisma.financialPaymentLink.update({
        where: { id: row.id },
        data: { active: false },
      });
      markedInactive++;
    }

    console.log(
      JSON.stringify(
        {
          total: rows.length,
          removedAsaasOk: removedAsaas,
          markedInactive,
          failures,
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
