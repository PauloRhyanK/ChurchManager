import assert from 'node:assert/strict';
import test from 'node:test';
import { CryptoService } from './crypto.service';

const validKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeService(key = validKey): CryptoService {
  const config = {
    get: (name: string) => (name === 'ENCRYPTION_KEY' ? key : undefined),
  };
  return new CryptoService(config as never);
}

test('decrypt(encrypt(X)) === X', () => {
  const service = makeService();
  const cipher = service.encrypt('asaas_live_key_123');
  const plain = service.decrypt(cipher);
  assert.equal(plain, 'asaas_live_key_123');
});

test('encrypt gera valores diferentes para mesmo input', () => {
  const service = makeService();
  const a = service.encrypt('same');
  const b = service.encrypt('same');
  assert.notEqual(a, b);
});

test('erro para payload malformado', () => {
  const service = makeService();
  assert.throws(() => service.decrypt('x:y'), /malformado|incompleto/i);
});

test('erro para chave inválida', () => {
  assert.throws(() => makeService('abc'), /ENCRYPTION_KEY inválida/i);
});

