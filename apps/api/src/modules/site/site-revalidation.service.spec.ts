import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { SiteRevalidationService } from './site-revalidation.service';

const SECRET = 'segredo-super-secreto';
const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200 } as Response;
  }) as never;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function build(
  env: Record<string, string | undefined>,
  tenantFind: () => Promise<unknown> = async () => ({ slug: 'paraiso' }),
) {
  const config = { get: (k: string) => env[k] };
  const prisma = { tenant: { findUnique: tenantFind } };
  return new SiteRevalidationService(config as never, prisma as never);
}

const TARGETS = JSON.stringify({
  paraiso: ['https://site.com.br', 'https://hml.site.com.br'],
});

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

test('dois destinos → duas chamadas com header e sem segredo na URL', async () => {
  const svc = build({
    SITE_REVALIDATION_SECRET: SECRET,
    SITE_REVALIDATION_TARGETS: TARGETS,
  });
  svc.notifyContentChanged('t1');
  await settle();
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.ok(!c.url.includes(SECRET));
    assert.ok(!c.url.includes('?'));
    assert.ok(c.url.endsWith('/api/revalidate-site-content'));
    assert.equal(
      (c.init.headers as Record<string, string>)['x-revalidation-secret'],
      SECRET,
    );
  }
  assert.deepEqual(calls.map((c) => c.url).sort(), [
    'https://hml.site.com.br/api/revalidate-site-content',
    'https://site.com.br/api/revalidate-site-content',
  ]);
});

test('tenant sem destino não chama fetch', async () => {
  const svc = build(
    { SITE_REVALIDATION_SECRET: SECRET, SITE_REVALIDATION_TARGETS: TARGETS },
    async () => ({ slug: 'outra' }),
  );
  svc.notifyContentChanged('t1');
  await settle();
  assert.equal(calls.length, 0);
});

test('destino http em produção é ignorado', async () => {
  const svc = build({
    SITE_REVALIDATION_SECRET: SECRET,
    NODE_ENV: 'production',
    SITE_REVALIDATION_TARGETS: '{"paraiso":["http://site.com.br"]}',
  });
  svc.notifyContentChanged('t1');
  await settle();
  assert.equal(calls.length, 0);
});

test('JSON inválido desativa sem lançar', async () => {
  const svc = build({
    SITE_REVALIDATION_SECRET: SECRET,
    SITE_REVALIDATION_TARGETS: '{quebrado',
  });
  assert.doesNotThrow(() => svc.notifyContentChanged('t1'));
  await settle();
  assert.equal(calls.length, 0);
});

test('falha no prisma não rejeita nem lança', async () => {
  const svc = build(
    { SITE_REVALIDATION_SECRET: SECRET, SITE_REVALIDATION_TARGETS: TARGETS },
    async () => {
      throw new Error('db fora');
    },
  );
  assert.doesNotThrow(() => svc.notifyContentChanged('t1'));
  await settle();
  assert.equal(calls.length, 0);
});

test('falha no fetch de um destino não impede o outro nem lança', async () => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://site.com.br')) {
      throw new Error('rede');
    }
    return { ok: false, status: 500 } as Response;
  }) as never;
  const svc = build({
    SITE_REVALIDATION_SECRET: SECRET,
    SITE_REVALIDATION_TARGETS: TARGETS,
  });
  assert.doesNotThrow(() => svc.notifyContentChanged('t1'));
  await settle();
  assert.equal(calls.length, 2);
});
