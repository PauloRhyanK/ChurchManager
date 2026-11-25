import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import type { HealthProbe } from './health.probe';

const TOKEN = 'token-de-teste-com-mais-de-32-caracteres';

function probe(pingOk = true): HealthProbe {
  return {
    ping: async () => {
      if (!pingOk) throw new Error('db:5432 recusou');
    },
    connections: async () => ({ active: 1, idle: 1, total: 2, max: 100 }),
    databaseSize: async () => 1000,
    businessCounts: async () => ({
      tenants: 1,
      activeAdminUsers: 1,
      eventRegistrationsLast24h: 0,
      financialTransactionsLast24h: 0,
    }),
  };
}

function fakeRes() {
  const sent = { status: 0, headers: {} as Record<string, string>, body: '' };
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    setHeader(name: string, value: string) {
      sent.headers[name.toLowerCase()] = value;
      return res;
    },
    send(body: string) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

async function call(authorization: string | undefined, env: string | undefined, pingOk = true) {
  const previous = process.env.HEALTH_TOKEN;
  if (env === undefined) delete process.env.HEALTH_TOKEN;
  else process.env.HEALTH_TOKEN = env;
  try {
    const { res, sent } = fakeRes();
    await new HealthController(probe(pingOk)).getHealth(authorization, res);
    return { ...sent, json: JSON.parse(sent.body) as Record<string, unknown> };
  } finally {
    if (previous === undefined) delete process.env.HEALTH_TOKEN;
    else process.env.HEALTH_TOKEN = previous;
  }
}

test('responde application/health+json sem cache', async () => {
  const r = await call(undefined, TOKEN);
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/health+json; charset=utf-8');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('sem token: só status e time', async () => {
  const r = await call(undefined, TOKEN);
  assert.deepEqual(Object.keys(r.json).sort(), ['status', 'time']);
  assert.equal(r.json.status, 'pass');
});

test('token certo no Bearer: resposta com checks', async () => {
  const r = await call(`Bearer ${TOKEN}`, TOKEN);
  assert.equal(r.json.serviceId, 'church-manager-api');
  assert.ok(r.json.checks);
});

test('token errado ou sem Bearer: só status e time', async () => {
  for (const auth of ['Bearer errado', TOKEN, `Basic ${TOKEN}`, 'Bearer ']) {
    const r = await call(auth, TOKEN);
    assert.deepEqual(Object.keys(r.json).sort(), ['status', 'time'], auth);
  }
});

test('HEALTH_TOKEN vazio ou ausente nunca libera os detalhes', async () => {
  for (const env of [undefined, '', '   ']) {
    const r = await call('Bearer ', env);
    assert.deepEqual(Object.keys(r.json).sort(), ['status', 'time']);
    const r2 = await call(`Bearer ${env ?? ''}`, env);
    assert.deepEqual(Object.keys(r2.json).sort(), ['status', 'time']);
  }
});

test('banco fora: 503 com status fail, sem detalhes do erro', async () => {
  const r = await call(`Bearer ${TOKEN}`, TOKEN, false);
  assert.equal(r.status, 503);
  assert.equal(r.json.status, 'fail');
  assert.doesNotMatch(r.body, /5432|recusou/);

  const pub = await call(undefined, TOKEN, false);
  assert.equal(pub.status, 503);
  assert.deepEqual(pub.json, { status: 'fail', time: pub.json.time });
});
