import assert from 'node:assert/strict';
import test from 'node:test';
import { InternalServerErrorException } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { AsaasWebhookService } from './asaas-webhook.service';

function minimalTenant(over: Partial<Tenant> = {}): Tenant {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    name: 'T',
    slug: 't',
    asaasApiKey: 'enc',
    asaasWebhookToken: 'encw',
    paymentSuccessRedirectUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

test('processRawBody: duplicado na tabela não chama GET customer', async () => {
  let getCustomerCalls = 0;
  const prisma = {
    financialWebhookEvent: {
      findUnique: async () => ({
        id: 'evt-row',
        idempotencyKey: 'k',
      }),
    },
  };
  const credentials = {};
  const asaas = {
    getCustomer: async () => {
      getCustomerCalls++;
      return { id: 'c' };
    },
  };
  const svc = new AsaasWebhookService(
    prisma as never,
    credentials as never,
    asaas as never,
  );
  const out = await svc.processRawBody(
    {
      id: 'asaas-evt-1',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay-1', customer: 'cus_1' },
    },
    undefined,
    minimalTenant(),
  );
  assert.equal(out.duplicate, true);
  assert.equal(getCustomerCalls, 0);
});

test('processRawBody: falha de getCustomer propaga (retry Asaas)', async () => {
  const prisma = {
    financialWebhookEvent: {
      findUnique: async () => null,
    },
  };
  const credentials = {
    getDecryptedApiKey: () => 'key',
  };
  const asaas = {
    getCustomer: async () => {
      throw new InternalServerErrorException('Asaas indisponível');
    },
  };
  const svc = new AsaasWebhookService(
    prisma as never,
    credentials as never,
    asaas as never,
  );
  await assert.rejects(
    () =>
      svc.processRawBody(
        {
          id: 'e1',
          event: 'PAYMENT_RECEIVED',
          payment: { id: 'p1', customer: 'cus_1' },
        },
        undefined,
        minimalTenant(),
      ),
    InternalServerErrorException,
  );
});
