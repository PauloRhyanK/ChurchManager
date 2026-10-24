import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { PublicEventsController } from '../modules/events/public-events.controller';
import { PublicFinancialController } from '../modules/financial/public-financial.controller';
import { PublicSiteContentController } from '../modules/site/public-site-content.controller';
import { TenantsMeUsersController } from '../modules/access/tenants-me-users.controller';
import { TenantsMePermissionGroupsController } from '../modules/access/tenants-me-permission-groups.controller';
import { TenantsMeSignupLinksController } from '../modules/access/tenants-me-signup-links.controller';
import { TenantsMeCotasController } from '../modules/financial/tenants-me-cotas.controller';
import { TenantsMeEventsPaymentLinksController } from '../modules/financial/tenants-me-events-payment-links.controller';
import { TenantsMeLinkPresetsController } from '../modules/financial/tenants-me-link-presets.controller';
import { BranchesController } from '../modules/church/branches.controller';
import { ChurchConfigController } from '../modules/church/church-config.controller';
import { PastorsController } from '../modules/church/pastors.controller';
import { MinistriesController } from '../modules/church/ministries.controller';
import { TenantsMeController } from '../modules/tenants/tenants-me.controller';
import { TenantsMePublicSiteController } from '../modules/tenants/tenants-me-public-site.controller';
import { PlatformTenantsController } from '../modules/tenants/platform-tenants.controller';
import { TenantsMeSiteContentController } from '../modules/site/tenants-me-site-content.controller';
import { TenantsMeCheckinController } from '../modules/events/tenants-me-checkin.controller';
import { TenantsMeEventTicketTypesController } from '../modules/events/tenants-me-event-ticket-types.controller';
import { TenantsMeEventFieldsController } from '../modules/events/tenants-me-event-fields.controller';
import { TenantsMeEventsController } from '../modules/events/tenants-me-events.controller';
import { TenantsMeEventsDashboardController } from '../modules/events/tenants-me-events-dashboard.controller';
import { TenantsMeSchedulesController } from '../modules/events/tenants-me-schedules.controller';
import { TenantsMeRegistrationsController } from '../modules/events/tenants-me-registrations.controller';
import { TenantsMeEventTagsController } from '../modules/events/tenants-me-event-tags.controller';

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

  for (let i = 0; i < 1_000; i += 1) {
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
});

test('rotas com x-participant-secret: 300/min (o site chama do servidor, um IP para todos)', async () => {
  assert.equal(
    await allowedPerMinute(PublicEventsController, 'checkRegistration'),
    300,
  );
  assert.equal(
    await allowedPerMinute(PublicEventsController, 'listMyRegistrations'),
    300,
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

/** Controllers autenticados do painel (JWT): sem `links` nem `platform`. */
const ADMIN_CONTROLLERS: Array<new (...args: never[]) => object> = [
  TenantsMeUsersController,
  TenantsMePermissionGroupsController,
  TenantsMeSignupLinksController,
  TenantsMeCotasController,
  TenantsMeEventsPaymentLinksController,
  TenantsMeLinkPresetsController,
  BranchesController,
  ChurchConfigController,
  PastorsController,
  MinistriesController,
  TenantsMeController,
  TenantsMePublicSiteController,
  PlatformTenantsController,
  TenantsMeSiteContentController,
  TenantsMeCheckinController,
  TenantsMeEventTicketTypesController,
  TenantsMeEventFieldsController,
  TenantsMeEventsController,
  TenantsMeEventsDashboardController,
  TenantsMeSchedulesController,
  TenantsMeRegistrationsController,
  TenantsMeEventTagsController,
];

/** Rotas do painel que mantêm um limite próprio, declarado no handler. */
const ADMIN_EXPLICIT_LIMITS: Record<string, number> = {
  'PlatformTenantsController.create': 10,
};

test('rotas do painel: 30/min por rota (o throttler platform só vale para criar igreja)', async () => {
  for (const controller of ADMIN_CONTROLLERS) {
    const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
      (name) =>
        name !== 'constructor' &&
        typeof (controller.prototype as Record<string, unknown>)[name] === 'function',
    );
    assert.ok(handlers.length > 0, `${controller.name} sem handlers`);
    for (const handler of handlers) {
      const key = `${controller.name}.${handler}`;
      assert.equal(
        await allowedPerMinute(controller, handler),
        ADMIN_EXPLICIT_LIMITS[key] ?? 30,
        key,
      );
    }
  }
});
