import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOnboardingUrl,
  resolveAdminWebBaseUrl,
} from './onboarding-url';

test('resolveAdminWebBaseUrl prefer ADMIN_WEB_BASE_URL', () => {
  assert.equal(
    resolveAdminWebBaseUrl({
      adminWebBaseUrl: 'https://admin.example.com/',
      adminCorsOrigin: 'https://other.example.com',
      nodeEnv: 'production',
    }),
    'https://admin.example.com',
  );
});

test('resolveAdminWebBaseUrl usa primeiro ADMIN_CORS_ORIGIN quando base falta', () => {
  assert.equal(
    resolveAdminWebBaseUrl({
      adminCorsOrigin: 'https://admin-qa.example.com, http://localhost:5173',
      nodeEnv: 'production',
    }),
    'https://admin-qa.example.com',
  );
});

test('resolveAdminWebBaseUrl falha em produção sem base nem CORS', () => {
  assert.throws(
    () =>
      resolveAdminWebBaseUrl({
        nodeEnv: 'production',
      }),
    /ADMIN_WEB_BASE_URL/,
  );
});

test('resolveAdminWebBaseUrl faz fallback para localhost fora de produção', () => {
  assert.equal(
    resolveAdminWebBaseUrl({ nodeEnv: 'development' }),
    'http://localhost:5173',
  );
});

test('buildOnboardingUrl concatena path', () => {
  assert.equal(
    buildOnboardingUrl('https://admin.example.com', '/convite/abc'),
    'https://admin.example.com/convite/abc',
  );
});
