import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentLinkExternalReference,
  parsePaymentLinkExternalReference,
} from './payment-link-external-reference';

test('build + parse roundtrip', () => {
  const ref = buildPaymentLinkExternalReference('igreja-x', 'cotas');
  assert.equal(ref, 'cm|v1|igreja-x|cotas');
  assert.deepEqual(parsePaymentLinkExternalReference(ref), {
    tenantSlug: 'igreja-x',
    sourceKey: 'cotas',
  });
});

test('parse rejeita formato inválido', () => {
  assert.equal(parsePaymentLinkExternalReference('nope'), null);
});
