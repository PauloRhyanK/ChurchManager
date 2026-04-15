import assert from 'node:assert/strict';
import test from 'node:test';
import { TenantCredentialsService } from './tenant-credentials.service';

test('updateAsaasCredentials salva valores cifrados quando chave Asaas é válida', async () => {
  const updated: { asaasApiKey?: string; asaasWebhookToken?: string } = {};
  const prisma = {
    tenant: {
      findUnique: async () => ({ id: 't1' }),
      update: async (args: {
        data: { asaasApiKey?: string; asaasWebhookToken?: string };
      }) => {
        updated.asaasApiKey = args.data.asaasApiKey;
        updated.asaasWebhookToken = args.data.asaasWebhookToken;
      },
    },
  };
  const crypto = {
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace('enc:', ''),
  };
  const asaas = {
    validateApiKey: async () => ({ id: 'ok' }),
  };
  const service = new TenantCredentialsService(
    prisma as never,
    crypto as never,
    asaas as never,
  );

  await service.updateAsaasCredentials('t1', {
    apiKey: 'live_api',
    webhookToken: 'live_hook',
  });

  assert.equal(updated.asaasApiKey, 'enc:live_api');
  assert.equal(updated.asaasWebhookToken, 'enc:live_hook');
});

test('updateAsaasCredentials permite salvar apenas webhookToken', async () => {
  const updated: { asaasApiKey?: string; asaasWebhookToken?: string } = {};
  const prisma = {
    tenant: {
      findUnique: async () => ({ id: 't1' }),
      update: async (args: {
        data: { asaasApiKey?: string; asaasWebhookToken?: string };
      }) => {
        updated.asaasApiKey = args.data.asaasApiKey;
        updated.asaasWebhookToken = args.data.asaasWebhookToken;
      },
    },
  };
  let calledValidateApiKey = false;
  const crypto = {
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace('enc:', ''),
  };
  const asaas = {
    validateApiKey: async () => {
      calledValidateApiKey = true;
      return { id: 'ok' };
    },
  };
  const service = new TenantCredentialsService(
    prisma as never,
    crypto as never,
    asaas as never,
  );

  await service.updateAsaasCredentials('t1', {
    webhookToken: 'only_hook_123',
  });

  assert.equal(calledValidateApiKey, false);
  assert.equal(updated.asaasApiKey, undefined);
  assert.equal(updated.asaasWebhookToken, 'enc:only_hook_123');
});

test('updateAsaasCredentials não persiste quando validação Asaas falha', async () => {
  let calledUpdate = false;
  const prisma = {
    tenant: {
      findUnique: async () => ({ id: 't1' }),
      update: async () => {
        calledUpdate = true;
      },
    },
  };
  const crypto = {
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace('enc:', ''),
  };
  const asaas = {
    validateApiKey: async () => {
      throw new Error('invalid key');
    },
  };
  const service = new TenantCredentialsService(
    prisma as never,
    crypto as never,
    asaas as never,
  );

  await assert.rejects(
    service.updateAsaasCredentials('t1', {
      apiKey: 'bad',
      webhookToken: 'hook',
    }),
  );
  assert.equal(calledUpdate, false);
});

