import assert from 'node:assert/strict';
import test from 'node:test';
import { pickRevalidationOrigin } from './site-revalidation.util';

test('pickRevalidationOrigin ignora localhost antigo e usa HTTPS público', () => {
  assert.equal(
    pickRevalidationOrigin([
      'http://localhost:3001',
      'https://igrejaparaiso.com.br',
    ]),
    'https://igrejaparaiso.com.br',
  );
});

test('pickRevalidationOrigin prefere HTTPS remoto', () => {
  assert.equal(
    pickRevalidationOrigin([
      'http://igrejaparaiso.com.br',
      'https://igrejaparaiso.com.br',
    ]),
    'https://igrejaparaiso.com.br',
  );
});

test('pickRevalidationOrigin fallback quando só há local', () => {
  assert.equal(
    pickRevalidationOrigin(['http://localhost:3001']),
    'http://localhost:3001',
  );
});
