import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { PublicEventsController } from '../modules/events/public-events.controller';
import { PublicFinancialController } from '../modules/financial/public-financial.controller';
import { PublicSiteContentController } from '../modules/site/public-site-content.controller';

/** Mesmos throttlers de `ThrottlerModule.forRoot` em app.module.ts. */
const THROTTLERS = [
  { name: 'public', ttl: 60_000, limit: 30 },
  { name: 'links', ttl: 60_000, limit: 20 },
  { name: 'platform', ttl: 60_000, limit: 10 },
];

/** Storage em memória: conta os hits por chave, sem timers. */
function memoryStorage(): ThrottlerStorage {
  const hits = new Map<string, number>();
  return {
    async increment(key: string, ttl: number, limit: number) {
      const totalHits = (hits.get(key) ?? 0) + 1;
      hits.set(key, totalHits);
      const isBlocked = totalHits > limit;
      return {
        totalHits,
        timeToExpire: ttl / 1000,
        isBlocked,
        timeToBlockExpire: isBlocked ? ttl / 1000 : 0,
      };
    },
  };
}

/** Quantos pedidos do mesmo IP passam no handler antes do 429. */
async function allowedPerMinute(
  controller: new (...args: never[]) => object,
  handlerName: string,
): Promise<number> {
  const guard = new ThrottlerGuard(
    THROTTLERS.map((t) => ({ ...t })),
    memoryStorage(),
    new Reflector(),
  );
  await guard.onModuleInit();
  const handler = (controller.prototype as Record<string, unknown>)[handlerName];
  assert.equal(typeof handler, 'function', `handler ${handlerName} inexistente`);
  const context = {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ ip: '203.0.113.7', headers: {} }),
      getResponse: () => ({ header: () => undefined }),
    }),
  } as unknown as Parameters<ThrottlerGuard['canActivate']>[0];

  for (let i = 0; i < 100; i += 1) {
    try {
      await guard.canActivate(context);
    } catch (err) {
      assert.ok(err instanceof ThrottlerException);
      return i;
    }
  }
  return Infinity;
}

test('rotas públicas de eventos: 30/min por IP (só o throttler public)', async () => {
  assert.equal(await allowedPerMinute(PublicEventsController, 'listEvents'), 30);
  assert.equal(await allowedPerMinute(PublicEventsController, 'getEvent'), 30);
  assert.equal(
    await allowedPerMinute(PublicEventsController, 'createRegistration'),
    30,
  );
  assert.equal(
    await allowedPerMinute(PublicEventsController, 'listMyRegistrations'),
    30,
  );
});

test('checkout de evento fica também sob o throttler links (20/min)', async () => {
  assert.equal(await allowedPerMinute(PublicEventsController, 'createCheckout'), 20);
});

test('conteúdo do site: 30/min por IP', async () => {
  assert.equal(await allowedPerMinute(PublicSiteContentController, 'list'), 30);
});

test('financeiro público: 30/min por IP, link de pagamento mantém 5/min', async () => {
  assert.equal(
    await allowedPerMinute(PublicFinancialController, 'upsertPayerProfile'),
    30,
  );
  assert.equal(
    await allowedPerMinute(PublicFinancialController, 'createPublicPaymentLink'),
    5,
  );
});
