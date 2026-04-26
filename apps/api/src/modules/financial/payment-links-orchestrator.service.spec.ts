import assert from 'node:assert/strict';
import test from 'node:test';
import { Tenant } from '@prisma/client';
import { PaymentLinksOrchestratorService } from './payment-links-orchestrator.service';

function tenant(): Tenant {
  return {
    id: '00000000-0000-4000-8000-000000000111',
    name: 'Igreja Teste',
    slug: 'igreja-teste',
    asaasApiKey: 'encrypted',
    asaasWebhookToken: null,
    paymentSuccessRedirectUrl: null,
    paymentSuccessRedirectEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test('orchestrator: reutiliza link existente por reuseKey', async () => {
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => ({
        providerLinkId: 'link-existing',
        url: 'https://www.asaas.com/c/existing',
        sourceKey: 'cotas',
        active: true,
      }),
    },
    financialLinkPreset: {
      findUnique: async () => ({
        id: 'preset-id',
        sourceKey: 'cotas',
        isMonthly: true,
        subscriptionDurationMonths: 12,
        valueCents: null,
        successUrl: null,
        autoRedirect: null,
        active: true,
        name: 'Cotas 12x',
      }),
    },
  };
  const generation = {
    create: async () => {
      throw new Error('não deveria criar novo link');
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    presetKey: 'cotas_12x_site',
  });
  assert.equal(out.id, 'link-existing');
  assert.equal(out.metadata.reused, true);
});

test('orchestrator: cria e persiste link quando não encontra', async () => {
  let createdInDb = false;
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => null,
      create: async () => {
        createdInDb = true;
      },
    },
    financialLinkPreset: {
      findUnique: async () => ({
        id: 'preset-id',
        sourceKey: 'cotas',
        isMonthly: false,
        subscriptionDurationMonths: null,
        valueCents: 5000,
        successUrl: null,
        autoRedirect: null,
        active: true,
        name: 'Cota unica',
      }),
    },
  };
  const generation = {
    create: async () => ({
      id: 'link-new',
      url: 'https://www.asaas.com/c/new',
      metadata: { source: 'cotas', tenant: 'igreja-teste' },
    }),
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    presetKey: 'cotas_unica',
  });
  assert.equal(out.id, 'link-new');
  assert.equal(out.metadata.reused, false);
  assert.equal(createdInDb, true);
});
