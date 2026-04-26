import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReuseKey,
  fromValueCents,
  toValueCents,
} from './payment-links-reuse.util';

test('toValueCents converte valor decimal', () => {
  assert.equal(toValueCents(50), 5000);
  assert.equal(toValueCents(12.34), 1234);
  assert.equal(toValueCents(undefined), null);
});

test('fromValueCents converte para reais', () => {
  assert.equal(fromValueCents(1234), 12.34);
  assert.equal(fromValueCents(null), undefined);
});

test('buildReuseKey ordena chaves para estabilidade', () => {
  const a = buildReuseKey({ b: 1, a: 'x', c: null });
  const b = buildReuseKey({ c: null, a: 'x', b: 1 });
  assert.equal(a, b);
  assert.equal(a, 'a:x|b:1|c:-');
});
