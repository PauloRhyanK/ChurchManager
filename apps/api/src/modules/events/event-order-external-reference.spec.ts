import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEventOrderExternalReference,
  parseEventOrderExternalReference,
} from './event-order-external-reference';

test('event order external reference roundtrip', () => {
  const ref = buildEventOrderExternalReference('paraiso', 'order-uuid');
  assert.equal(ref, 'cm|event-order|v1|paraiso|order-uuid');
  assert.deepEqual(parseEventOrderExternalReference(ref), {
    tenantSlug: 'paraiso',
    orderId: 'order-uuid',
  });
});

test('parseEventOrderExternalReference rejeita formato inválido', () => {
  assert.equal(parseEventOrderExternalReference('invalid'), null);
});
