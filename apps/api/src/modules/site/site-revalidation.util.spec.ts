import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRevalidationTargets } from './site-revalidation.util';

test('parseRevalidationTargets aceita https e normaliza barra final', () => {
  const { byTenant, rejected } = parseRevalidationTargets(
    '{"paraiso":["https://site.com.br/","https://hml.site.com.br"]}',
    true,
  );
  assert.deepEqual(byTenant.get('paraiso'), [
    'https://site.com.br',
    'https://hml.site.com.br',
  ]);
  assert.equal(rejected.length, 0);
});

test('parseRevalidationTargets ignora http em produção, aceita localhost fora dela', () => {
  const raw = '{"a":["http://site.com","http://localhost:3001"]}';
  assert.equal(parseRevalidationTargets(raw, true).byTenant.has('a'), false);
  assert.deepEqual(parseRevalidationTargets(raw, false).byTenant.get('a'), [
    'http://localhost:3001',
  ]);
});

test('parseRevalidationTargets rejeita credenciais na URL', () => {
  const r = parseRevalidationTargets('{"a":["https://u:p@site.com"]}', true);
  assert.equal(r.byTenant.has('a'), false);
  assert.equal(r.rejected.length, 1);
});

test('parseRevalidationTargets lança em JSON inválido ou formato errado', () => {
  assert.throws(() => parseRevalidationTargets('{nope', true));
  assert.throws(() => parseRevalidationTargets('[]', true));
  assert.throws(() => parseRevalidationTargets('{"a":"https://x.com"}', true));
});
