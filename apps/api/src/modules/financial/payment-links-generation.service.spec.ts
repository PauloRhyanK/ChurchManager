import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import {
  PAYMENT_LINK_SOURCE_COTAS,
  PaymentLinksGenerationService,
} from './payment-links-generation.service';

function tenant(over: Partial<Tenant> = {}): Tenant {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Igreja Teste',
    slug: 'igreja-teste',
    asaasApiKey: 'cifrado',
    asaasWebhookToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

const cotasOpts = {
  sourceKey: PAYMENT_LINK_SOURCE_COTAS,
  asaasLinkName: 'Cotas — Igreja Teste',
} as const;

test('create: isMonthly false usa DETACHED sem subscriptionCycle', async () => {
  let bodySent: {
    chargeType: string;
    subscriptionCycle?: string;
    dueDateLimitDays?: number;
    value?: number;
    externalReference?: string;
  };
  const asaas = {
    createPaymentLink: async (input: {
      apiKey: string;
      body: typeof bodySent;
    }) => {
      bodySent = input.body;
      assert.equal(input.apiKey, 'plain-key');
      return { id: 'link-1', url: 'https://www.asaas.com/c/abc' };
    },
  };
  const credentials = {
    getDecryptedApiKey: () => 'plain-key',
  };
  const service = new PaymentLinksGenerationService(
    asaas as never,
    credentials as never,
  );
  const out = await service.create(tenant(), {
    isMonthly: false,
    ...cotasOpts,
  });
  assert.equal(bodySent!.chargeType, 'DETACHED');
  assert.equal(bodySent!.subscriptionCycle, undefined);
  assert.equal(bodySent!.dueDateLimitDays, 10);
  assert.equal(bodySent!.externalReference, 'cm|v1|igreja-teste|cotas');
  assert.equal(out.id, 'link-1');
  assert.equal(out.metadata.source, PAYMENT_LINK_SOURCE_COTAS);
  assert.equal(out.metadata.tenant, 'igreja-teste');
});

test('create: isMonthly true usa RECURRENT, MONTHLY e endDate', async () => {
  let bodySent: {
    chargeType: string;
    subscriptionCycle?: string;
    dueDateLimitDays?: number;
    endDate?: string;
    description?: string;
  };
  const asaas = {
    createPaymentLink: async (input: { body: typeof bodySent }) => {
      bodySent = input.body;
      return { id: 'link-2', url: 'https://www.asaas.com/c/def' };
    },
  };
  const credentials = { getDecryptedApiKey: () => 'k' };
  const service = new PaymentLinksGenerationService(
    asaas as never,
    credentials as never,
  );
  await service.create(tenant(), {
    isMonthly: true,
    subscriptionDurationMonths: 6,
    ...cotasOpts,
  });
  assert.equal(bodySent!.chargeType, 'RECURRENT');
  assert.equal(bodySent!.subscriptionCycle, 'MONTHLY');
  assert.equal(bodySent!.dueDateLimitDays, 10);
  assert.match(bodySent!.endDate ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(
    bodySent!.description ?? '',
    /Assinatura mensal — 6 meses/,
  );
});

test('create: envia value quando informado', async () => {
  let bodySent: { value?: number };
  const asaas = {
    createPaymentLink: async (input: { body: typeof bodySent }) => {
      bodySent = input.body;
      return { id: 'x', url: 'https://x' };
    },
  };
  const credentials = { getDecryptedApiKey: () => 'k' };
  const service = new PaymentLinksGenerationService(
    asaas as never,
    credentials as never,
  );
  await service.create(tenant(), {
    isMonthly: false,
    value: 42.5,
    ...cotasOpts,
  });
  assert.equal(bodySent!.value, 42.5);
});

test('create: 503 sem asaasApiKey', async () => {
  const service = new PaymentLinksGenerationService({} as never, {} as never);
  await assert.rejects(
    () =>
      service.create(tenant({ asaasApiKey: null }), {
        isMonthly: false,
        ...cotasOpts,
      }),
    ServiceUnavailableException,
  );
});
