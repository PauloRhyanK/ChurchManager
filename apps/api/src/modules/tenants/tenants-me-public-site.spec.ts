import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '../auth/auth-user';
import { REQUIRE_PERMISSION_KEY } from '../access/require-permission.decorator';
import { SiteRevalidationService } from '../site/site-revalidation.service';
import { TenantsMePublicSiteController } from './tenants-me-public-site.controller';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { tenantId: TENANT, tenantSlug: 'paraiso' } as AuthUser;

function build(
  origins: string[],
  env: Record<string, string | undefined> = {},
) {
  const listed: string[] = [];
  const publicWebOrigins = {
    listForTenant: async (tenantId: string) => {
      listed.push(tenantId);
      return origins.map((origin, i) => ({
        id: `o${i}`,
        origin,
        createdAt: new Date(),
      }));
    },
  };
  const revalidation = new SiteRevalidationService(
    { get: (k: string) => env[k] } as never,
    {} as never,
  );
  const controller = new TenantsMePublicSiteController(
    publicWebOrigins as never,
    revalidation,
  );
  return { controller, listed };
}

test('public-site: usa o destino da revalidação do site quando configurado', async () => {
  const { controller } = build(['https://cors.exemplo.com'], {
    SITE_REVALIDATION_TARGETS: JSON.stringify({
      paraiso: ['https://igrejaparaiso.com.br/', 'https://hml.igrejaparaiso.com.br'],
      outra: ['https://outra.com'],
    }),
  });
  assert.deepEqual(await controller.getPublicSite(user), {
    publicSiteUrl: 'https://igrejaparaiso.com.br',
  });
});

test('public-site: sem destino de revalidação, primeira origem https pública', async () => {
  const { controller, listed } = build(
    [
      'http://localhost:3001',
      'https://localhost:3443',
      'https://127.0.0.1:8443',
      'http://site-antigo.com.br',
      'https://igrejaparaiso.com.br',
      'https://www.igrejaparaiso.com.br',
    ],
    { SITE_REVALIDATION_TARGETS: JSON.stringify({ outra: ['https://outra.com'] }) },
  );
  assert.deepEqual(await controller.getPublicSite(user), {
    publicSiteUrl: 'https://igrejaparaiso.com.br',
  });
  assert.deepEqual(listed, [TENANT]);
});

test('public-site: só origens http/localhost → null', async () => {
  const { controller } = build([
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'https://localhost:3443',
    'http://igrejaparaiso.com.br',
  ]);
  assert.deepEqual(await controller.getPublicSite(user), { publicSiteUrl: null });
});

test('public-site: sem origens → null', async () => {
  const { controller } = build([]);
  assert.deepEqual(await controller.getPublicSite(user), { publicSiteUrl: null });
});

test('public-site: protegido só pelo JWT, sem permissão de módulo', () => {
  const reflector = new Reflector();
  const handler = TenantsMePublicSiteController.prototype.getPublicSite;
  const guards = reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, [
    handler,
    TenantsMePublicSiteController,
  ]);
  // AuthGuard é memoizado por estratégia: AuthGuard('jwt') devolve a mesma classe.
  assert.deepEqual(guards, [AuthGuard('jwt')]);
  assert.equal(
    reflector.getAllAndOverride(REQUIRE_PERMISSION_KEY, [
      handler,
      TenantsMePublicSiteController,
    ]),
    undefined,
  );
});
