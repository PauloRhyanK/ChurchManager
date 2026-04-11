import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPublicTenantSlug } from './dynamic-cors.middleware';

test('extractPublicTenantSlug extrai slug de rotas públicas', () => {
  assert.equal(extractPublicTenantSlug('/api/public/tenants/demo/links'), 'demo');
  assert.equal(
    extractPublicTenantSlug('/public/tenants/minha-igreja/payer-profiles'),
    'minha-igreja',
  );
});

test('extractPublicTenantSlug devolve null fora do padrão', () => {
  assert.equal(extractPublicTenantSlug('/admin/tenants/me'), null);
  assert.equal(extractPublicTenantSlug('/health'), null);
});
