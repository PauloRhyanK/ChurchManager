import assert from 'node:assert/strict';
import test from 'node:test';
import { readBootstrapEnv } from './bootstrap-env';

const SECRET = { PUBLIC_PARTICIPANT_API_SECRET: 'segredo' };

test('TRUST_PROXY_HOPS ausente, vazio ou 0: sem trust proxy e sem aviso', () => {
  for (const value of [undefined, '', '0']) {
    assert.deepEqual(readBootstrapEnv({ TRUST_PROXY_HOPS: value }), {
      trustProxyHops: 0,
      warnings: [],
    });
  }
});

test('TRUST_PROXY_HOPS inteiro positivo liga o trust proxy', () => {
  assert.deepEqual(readBootstrapEnv({ TRUST_PROXY_HOPS: '2' }), {
    trustProxyHops: 2,
    warnings: [],
  });
});

test('TRUST_PROXY_HOPS inválido: desliga o trust proxy e avisa', () => {
  for (const value of ['dois', '-1', '1.5']) {
    const { trustProxyHops, warnings } = readBootstrapEnv({
      TRUST_PROXY_HOPS: value,
    });
    assert.equal(trustProxyHops, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^TRUST_PROXY_HOPS inválido/);
    assert.ok(warnings[0].includes(`"${value}"`));
  }
});

test('produção sem PUBLIC_PARTICIPANT_API_SECRET avisa', () => {
  for (const secret of [undefined, '  ']) {
    const { warnings } = readBootstrapEnv({
      NODE_ENV: 'production',
      PUBLIC_PARTICIPANT_API_SECRET: secret,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^PUBLIC_PARTICIPANT_API_SECRET ausente em produção/);
  }
});

test('segredo configurado em produção, ou ausente fora dela: sem aviso', () => {
  assert.deepEqual(
    readBootstrapEnv({ NODE_ENV: 'production', ...SECRET }).warnings,
    [],
  );
  assert.deepEqual(readBootstrapEnv({ NODE_ENV: 'development' }).warnings, []);
});
