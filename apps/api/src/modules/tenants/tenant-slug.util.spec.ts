import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTenantSlugValid,
  normalizeTenantSlug,
} from './tenant-slug.util';

test('normalizeTenantSlug: trim e minúsculas', () => {
  assert.equal(normalizeTenantSlug('  Minha-Igreja '), 'minha-igreja');
});

test('assertTenantSlugValid: aceita slug válido', () => {
  assert.doesNotThrow(() => assertTenantSlugValid('igreja-demo'));
});

test('assertTenantSlugValid: rejeita maiúsculas', () => {
  assert.throws(() => assertTenantSlugValid('Demo'), /Slug inválido/);
});

test('assertTenantSlugValid: rejeita hífen nas pontas', () => {
  assert.throws(() => assertTenantSlugValid('-x'), /Slug inválido/);
  assert.throws(() => assertTenantSlugValid('x-'), /Slug inválido/);
});

test('assertTenantSlugValid: rejeita comprimento', () => {
  assert.throws(() => assertTenantSlugValid('a'), /2 e 100/);
});
