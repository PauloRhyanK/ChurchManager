import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { HealthController, checkDatabase } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';

function fakePrisma(queryRaw: () => Promise<unknown>): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

test('health responde ok quando o banco responde', async () => {
  let calls = 0;
  const controller = new HealthController(
    fakePrisma(async () => {
      calls += 1;
      return [{ '?column?': 1 }];
    }),
  );

  const body = await controller.getHealth();

  assert.equal(calls, 1);
  assert.deepEqual(body, {
    ok: true,
    service: 'church-manager-api',
    database: 'up',
  });
});

test('health responde 503 sem vazar o erro quando o banco falha', async () => {
  const secret =
    "Can't reach database server at `db:5432` postgresql://user:senha@db/churchmanager";
  const controller = new HealthController(
    fakePrisma(async () => {
      throw new Error(secret);
    }),
  );

  await assert.rejects(controller.getHealth(), (err: unknown) => {
    assert.ok(err instanceof ServiceUnavailableException);
    assert.equal(err.getStatus(), HttpStatus.SERVICE_UNAVAILABLE);
    assert.deepEqual(err.getResponse(), {
      ok: false,
      service: 'church-manager-api',
      database: 'down',
    });
    assert.doesNotMatch(JSON.stringify(err.getResponse()), /5432|senha|reach/);
    return true;
  });
});

test('checkDatabase falha quando a consulta passa do tempo limite', async () => {
  const hanging = fakePrisma(() => new Promise(() => undefined));
  const started = Date.now();

  assert.equal(await checkDatabase(hanging, 50), false);
  assert.ok(Date.now() - started < 1000);
});

test('checkDatabase devolve true quando a consulta responde', async () => {
  assert.equal(await checkDatabase(fakePrisma(async () => [1]), 50), true);
});
