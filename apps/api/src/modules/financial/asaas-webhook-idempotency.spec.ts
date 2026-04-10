import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebhookIdempotencyKey } from './asaas-webhook-idempotency';

const tenant = '00000000-0000-4000-8000-000000000001';

test('prioriza header idempotency-key', () => {
  const k = buildWebhookIdempotencyKey(tenant, 'abc', {
    id: 'evt-1',
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay-1' },
  });
  assert.equal(k, `${tenant}:hdr:abc`);
});

test('usa body.id quando sem header', () => {
  const k = buildWebhookIdempotencyKey(tenant, undefined, {
    id: 'evt-xyz',
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay-1' },
  });
  assert.equal(k, `${tenant}:evt:evt-xyz`);
});

test('fallback event e payment.id', () => {
  const k = buildWebhookIdempotencyKey(tenant, undefined, {
    event: 'PAYMENT_CREATED',
    payment: { id: 'pay-99' },
  });
  assert.equal(k, `${tenant}:PAYMENT_CREATED:pay-99`);
});

test('fallback usa subscription.id sem payment', () => {
  const k = buildWebhookIdempotencyKey(tenant, undefined, {
    event: 'SUBSCRIPTION_CREATED',
    subscription: { id: 'sub-1' },
  });
  assert.equal(k, `${tenant}:SUBSCRIPTION_CREATED:sub-1`);
});

test('encurta chave longa com SHA-256 hex', () => {
  const longId = 'x'.repeat(300);
  const k = buildWebhookIdempotencyKey(tenant, undefined, {
    id: longId,
    event: 'X',
  });
  assert.equal(k.length, 64);
  assert.match(k, /^[0-9a-f]{64}$/);
});
