import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHealthReport } from './health-report';
import type { HealthProbe } from './health.probe';

const SECRET =
  "Can't reach database server at `db:5432` postgresql://user:senha@db/churchmanager";

type Calls = { ping: number; connections: number; size: number; business: number };

function fakeProbe(overrides: Partial<HealthProbe> = {}): HealthProbe & { calls: Calls } {
  const calls: Calls = { ping: 0, connections: 0, size: 0, business: 0 };
  const base: HealthProbe = {
    ping: async () => undefined,
    connections: async () => ({ active: 3, idle: 7, total: 10, max: 100 }),
    databaseSize: async () => 12_345_678,
    businessCounts: async () => ({
      tenants: 2,
      activeAdminUsers: 15,
      eventRegistrationsLast24h: 4,
      financialTransactionsLast24h: 1,
    }),
  };
  const probe = { ...base, ...overrides };
  return {
    calls,
    ping: () => (calls.ping++, probe.ping()),
    connections: () => (calls.connections++, probe.connections()),
    databaseSize: () => (calls.size++, probe.databaseSize()),
    businessCounts: (since) => (calls.business++, probe.businessCounts(since)),
  };
}

const DETAILED = { detailed: true, timeoutMs: 200, slowMs: 100, releaseId: 'abc1234' };
const PUBLIC = { detailed: false, timeoutMs: 200, slowMs: 100, releaseId: 'abc1234' };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hang = () => new Promise<never>(() => undefined);

test('detalhado e saudável: pass, 200, todos os checks no formato health+json', async () => {
  const probe = fakeProbe();
  const { httpStatus, body } = await buildHealthReport(probe, DETAILED);

  assert.equal(httpStatus, 200);
  assert.equal(body.status, 'pass');
  assert.equal(body.serviceId, 'church-manager-api');
  assert.equal(body.releaseId, 'abc1234');
  assert.ok(!Number.isNaN(Date.parse(body.time)));
  assert.equal(typeof body.uptime, 'number');

  const checks = body.checks!;
  assert.deepEqual(Object.keys(checks).sort(), [
    'eventRegistrations:last24h',
    'financialTransactions:last24h',
    'memory:heapUsed',
    'memory:rss',
    'postgres:connections',
    'postgres:responseTime',
    'postgres:size',
    'tenants:count',
    'users:active',
  ]);
  for (const [name, [entry]] of Object.entries(checks)) {
    assert.equal(entry.status, 'pass', name);
    assert.ok(entry.componentType, name);
    assert.equal(typeof entry.observedValue, 'number', name);
    assert.ok(entry.observedUnit, name);
    assert.ok(!Number.isNaN(Date.parse(entry.time)), name);
  }

  const [conn] = checks['postgres:connections'];
  assert.equal(conn.observedValue, 10);
  assert.equal(conn.observedUnit, 'connections');
  assert.equal(conn.active, 3);
  assert.equal(conn.idle, 7);
  assert.equal(conn.max, 100);
  assert.equal(checks['postgres:size'][0].observedValue, 12_345_678);
  assert.equal(checks['postgres:size'][0].observedUnit, 'bytes');
  assert.equal(checks['postgres:responseTime'][0].observedUnit, 'ms');
  assert.equal(checks['tenants:count'][0].observedValue, 2);
  assert.equal(checks['users:active'][0].observedValue, 15);
  assert.equal(checks['eventRegistrations:last24h'][0].observedValue, 4);
  assert.equal(checks['financialTransactions:last24h'][0].observedValue, 1);
});

test('contagens de 24 h usam uma janela de 24 horas', async () => {
  let since: Date | undefined;
  const probe = fakeProbe({
    businessCounts: async (s) => {
      since = s;
      return { tenants: 0, activeAdminUsers: 0, eventRegistrationsLast24h: 0, financialTransactionsLast24h: 0 };
    },
  });
  const before = Date.now();
  await buildHealthReport(probe, DETAILED);
  const ageMs = before - since!.getTime();
  assert.ok(Math.abs(ageMs - 24 * 3600 * 1000) < 1000);
});

test('sem detalhes: só status e time, e não roda as consultas caras', async () => {
  const probe = fakeProbe();
  const { httpStatus, body } = await buildHealthReport(probe, PUBLIC);

  assert.equal(httpStatus, 200);
  assert.deepEqual(Object.keys(body).sort(), ['status', 'time']);
  assert.equal(body.status, 'pass');
  assert.equal(probe.calls.size, 0);
  assert.equal(probe.calls.business, 0);
});

test('banco fora: fail, 503, sem vazar a mensagem do erro', async () => {
  const probe = fakeProbe({
    ping: async () => {
      throw new Error(SECRET);
    },
  });

  for (const opts of [DETAILED, PUBLIC]) {
    const { httpStatus, body } = await buildHealthReport(probe, opts);
    assert.equal(httpStatus, 503);
    assert.equal(body.status, 'fail');
    assert.doesNotMatch(JSON.stringify(body), /5432|senha|reach|db:/);
  }

  const { body } = await buildHealthReport(probe, DETAILED);
  const [ping] = body.checks!['postgres:responseTime'];
  assert.equal(ping.status, 'fail');
  assert.equal(ping.observedValue, undefined);
  assert.equal(body.checks!['postgres:size'], undefined);
  assert.equal(probe.calls.size, 0);
  assert.equal(probe.calls.business, 0);
});

test('banco travado: fail pelo tempo limite, sem esperar a consulta', async () => {
  const probe = fakeProbe({ ping: hang });
  const started = Date.now();
  const { httpStatus, body } = await buildHealthReport(probe, DETAILED);

  assert.equal(httpStatus, 503);
  assert.equal(body.status, 'fail');
  assert.ok(Date.now() - started < 1000);
});

test('conexões acima de 80% do max_connections: warn com 200, também sem detalhes', async () => {
  const probe = fakeProbe({
    connections: async () => ({ active: 50, idle: 35, total: 85, max: 100 }),
  });

  const detailed = await buildHealthReport(probe, DETAILED);
  assert.equal(detailed.httpStatus, 200);
  assert.equal(detailed.body.status, 'warn');
  assert.equal(detailed.body.checks!['postgres:connections'][0].status, 'warn');

  const pub = await buildHealthReport(probe, PUBLIC);
  assert.equal(pub.httpStatus, 200);
  assert.equal(pub.body.status, 'warn');
});

test('SELECT 1 lento: warn no responseTime', async () => {
  const probe = fakeProbe({ ping: () => sleep(130) });
  const { httpStatus, body } = await buildHealthReport(probe, DETAILED);

  assert.equal(httpStatus, 200);
  assert.equal(body.status, 'warn');
  const [ping] = body.checks!['postgres:responseTime'];
  assert.equal(ping.status, 'warn');
  assert.ok((ping.observedValue as number) >= 100);
});

test('falha numa consulta secundária vira warn naquele check, sem mensagem', async () => {
  const probe = fakeProbe({
    businessCounts: async () => {
      throw new Error(SECRET);
    },
    databaseSize: hang,
  });
  const { httpStatus, body } = await buildHealthReport(probe, DETAILED);

  assert.equal(httpStatus, 200);
  assert.equal(body.status, 'warn');
  assert.equal(body.checks!['postgres:responseTime'][0].status, 'pass');
  for (const name of ['tenants:count', 'users:active', 'postgres:size']) {
    const [entry] = body.checks![name];
    assert.equal(entry.status, 'warn', name);
    assert.equal(entry.observedValue, undefined, name);
  }
  assert.doesNotMatch(JSON.stringify(body), /5432|senha|reach|db:/);
});
