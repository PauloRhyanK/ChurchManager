import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPublicTenantSlug,
  normalizeOrigin,
  requestOrigin,
} from './dynamic-cors.middleware';
import type { Request } from 'express';

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

test('normalizeOrigin remove barra final', () => {
  assert.equal(
    normalizeOrigin('https://admin-qa.example.com/'),
    'https://admin-qa.example.com',
  );
});

test('requestOrigin usa Referer quando Origin ausente', () => {
  const req = {
    headers: {
      referer: 'https://admin-qa.example.com/login',
    },
  } as Request;
  assert.equal(requestOrigin(req), 'https://admin-qa.example.com');
});
