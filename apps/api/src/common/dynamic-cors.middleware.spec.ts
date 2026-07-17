import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPublicTenantSlug,
  isAdminFamilyPath,
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

test('isAdminFamilyPath cobre login, admin e health', () => {
  assert.equal(isAdminFamilyPath('/api/auth/login'), true);
  assert.equal(isAdminFamilyPath('/api/admin/tenants/me'), true);
  assert.equal(isAdminFamilyPath('/api/health'), true);
  assert.equal(isAdminFamilyPath('/health'), true);
});

test('isAdminFamilyPath cobre onboarding público (signup e convites)', () => {
  assert.equal(isAdminFamilyPath('/api/public/signup/abc'), true);
  assert.equal(isAdminFamilyPath('/public/signup/abc'), true);
  assert.equal(isAdminFamilyPath('/api/public/invitations/abc'), true);
  assert.equal(isAdminFamilyPath('/api/public/invitations/abc/accept'), true);
});

test('isAdminFamilyPath cobre recuperação de senha', () => {
  assert.equal(isAdminFamilyPath('/api/public/password-reset'), true);
  assert.equal(isAdminFamilyPath('/public/password-reset'), true);
  assert.equal(isAdminFamilyPath('/api/public/password-reset/abc'), true);
  assert.equal(isAdminFamilyPath('/public/password-reset/abc'), true);
});

test('isAdminFamilyPath não cobre sites públicos por tenant', () => {
  assert.equal(isAdminFamilyPath('/api/public/tenants/demo/links'), false);
  assert.equal(isAdminFamilyPath('/api/public/events'), false);
});

test('requestOrigin usa Referer quando Origin ausente', () => {
  const req = {
    headers: {
      referer: 'https://admin-qa.example.com/login',
    },
  } as Request;
  assert.equal(requestOrigin(req), 'https://admin-qa.example.com');
});
