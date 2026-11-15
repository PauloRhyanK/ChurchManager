import assert from 'node:assert/strict';
import test from 'node:test';
import { maskEmail } from './mask-email';

test('maskEmail: mantém 2 letras e o domínio', () => {
  assert.equal(maskEmail('Paulo@Gmail.com'), 'pa***@gmail.com');
  assert.equal(maskEmail('a@x.com'), 'a***@x.com');
});

test('maskEmail: vazio ou inválido → null', () => {
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail(''), null);
  assert.equal(maskEmail('sem-arroba'), null);
  assert.equal(maskEmail('@dominio.com'), null);
  assert.equal(maskEmail('fulano@'), null);
});
