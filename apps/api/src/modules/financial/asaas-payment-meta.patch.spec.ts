import assert from 'node:assert/strict';
import test from 'node:test';
import {
  paymentAsaasMetaPatch,
  planLabelFromRawPayloadRef,
} from './asaas-payment-meta.patch';

test('paymentAsaasMetaPatch: extrai subscription, link e description', () => {
  const patch = paymentAsaasMetaPatch({
    subscription: 'sub_abc',
    paymentLink: 'link123',
    description: 'Assinatura mensal',
    installmentNumber: 2,
  });
  assert.equal(patch.asaasSubscriptionId, 'sub_abc');
  assert.equal(patch.asaasPaymentLinkId, 'link123');
  assert.equal(patch.paymentDescription, 'Assinatura mensal');
  assert.equal(patch.installmentNumber, 2);
});

test('planLabelFromRawPayloadRef: prioriza paymentDescription', () => {
  assert.equal(
    planLabelFromRawPayloadRef(
      { paymentDescription: 'Assinatura mensal — 5 meses' },
      0,
    ),
    'Assinatura mensal — 5 meses',
  );
});

test('planLabelFromRawPayloadRef: fallback linkTracking + valor', () => {
  const label = planLabelFromRawPayloadRef(
    { linkTracking: { tenantSlug: 'demo', sourceKey: 'cotas' } },
    200_000,
  );
  assert.ok(label);
  assert.match(label.replace(/\u00a0/g, ' '), /2\.000,00.*\(cotas\)/);
});
