import assert from 'node:assert/strict';
import test from 'node:test';
import type { Tenant } from '@prisma/client';
import { AsaasSubscriptionDurationSyncService } from './asaas-subscription-duration-sync.service';
import { computeSubscriptionEndDateYmd } from './payment-link-subscription-end';

function tenant(): Tenant {
  return {
    id: 't1',
    name: 'T',
    slug: 'demo',
    asaasApiKey: 'enc',
    asaasWebhookToken: 'w',
    paymentSuccessRedirectUrl: null,
    paymentSuccessRedirectEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test('applyFromPaymentLink: envia endDate para assinatura mensal 6 meses', async () => {
  let updateBody: { endDate?: string } | undefined;
  const prisma = {
    financialPaymentLink: {
      findFirst: async () => ({
        isMonthly: true,
        subscriptionDurationMonths: 6,
      }),
    },
  };
  const credentials = { getDecryptedApiKey: () => 'key' };
  const asaas = {
    updateSubscription: async (input: { body: { endDate?: string } }) => {
      updateBody = input.body;
      return { id: 'sub_1' };
    },
  };
  const svc = new AsaasSubscriptionDurationSyncService(
    prisma as never,
    credentials as never,
    asaas as never,
  );
  await svc.applyFromPaymentLink(tenant(), 'sub_abc', 'link_2e3');
  assert.equal(updateBody?.endDate, computeSubscriptionEndDateYmd(6));
});

test('applyFromPaymentLink: ignora cobrança única (1 mês)', async () => {
  let called = false;
  const prisma = {
    financialPaymentLink: {
      findFirst: async () => ({
        isMonthly: true,
        subscriptionDurationMonths: 1,
      }),
    },
  };
  const asaas = {
    updateSubscription: async () => {
      called = true;
      return { id: 'sub_1' };
    },
  };
  const svc = new AsaasSubscriptionDurationSyncService(
    prisma as never,
    { getDecryptedApiKey: () => 'k' } as never,
    asaas as never,
  );
  await svc.applyFromPaymentLink(tenant(), 'sub_abc', 'link_x');
  assert.equal(called, false);
});

test('applyFromPaymentLink: ignora link não encontrado', async () => {
  let called = false;
  const prisma = {
    financialPaymentLink: {
      findFirst: async () => null,
    },
  };
  const asaas = {
    updateSubscription: async () => {
      called = true;
      return { id: 'sub_1' };
    },
  };
  const svc = new AsaasSubscriptionDurationSyncService(
    prisma as never,
    { getDecryptedApiKey: () => 'k' } as never,
    asaas as never,
  );
  await svc.applyFromPaymentLink(tenant(), 'sub_abc', 'unknown');
  assert.equal(called, false);
});
