import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { SITE_HOME_BLOCKS } from './site-content.registry';
import { PublicSiteContentController } from './public-site-content.controller';
import { SiteContentService } from './site-content.service';
import { normalizeHomeOrder, validateHomeOrder } from './site-layout';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEFAULT = [...SITE_HOME_BLOCKS];

test('blocos da home: ordem padrão é a do site hoje', () => {
  assert.deepEqual(DEFAULT, [
    'mission',
    'schedules',
    'celulas',
    'events',
    'churches',
    'giving',
    'youtube',
  ]);
});

test('validateHomeOrder aceita qualquer permutação completa', () => {
  const reordered = ['youtube', ...DEFAULT.slice(0, -1)];
  assert.deepEqual(validateHomeOrder(reordered), reordered);
});

test('validateHomeOrder rejeita lista incompleta, repetida, com id estranho ou não-lista', () => {
  const cases: unknown[] = [
    DEFAULT.slice(1),
    [...DEFAULT, 'mission'],
    [...DEFAULT.slice(1), 'hero'],
    'mission',
    null,
    [...DEFAULT.slice(1), 42],
  ];
  for (const raw of cases) {
    assert.throws(() => validateHomeOrder(raw), BadRequestException, JSON.stringify(raw));
  }
});

test('normalizeHomeOrder: sem ordem salva devolve a padrão', () => {
  assert.deepEqual(normalizeHomeOrder(null), DEFAULT);
  assert.deepEqual(normalizeHomeOrder(undefined), DEFAULT);
});

test('normalizeHomeOrder: remove id desconhecido e repetido', () => {
  const stored = ['youtube', 'antigo', ...DEFAULT.slice(0, -1), 'mission'];
  assert.deepEqual(normalizeHomeOrder(stored), ['youtube', ...DEFAULT.slice(0, -1)]);
});

test('normalizeHomeOrder: bloco que falta entra na posição padrão', () => {
  const stored = ['youtube', 'mission', 'celulas', 'events', 'churches', 'giving'];
  assert.deepEqual(normalizeHomeOrder(stored), [
    'youtube',
    'mission',
    'schedules',
    'celulas',
    'events',
    'churches',
    'giving',
  ]);
  // Sem antecessor presente, vai para o início.
  assert.deepEqual(normalizeHomeOrder(DEFAULT.slice(1)), DEFAULT);
});

function createService(stored: { homeOrder: string[]; updatedAt: Date } | null) {
  const capture: { where?: unknown; create?: unknown; update?: unknown; notified?: string } = {};
  const prisma = {
    siteLayout: {
      findUnique: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return stored;
      },
      upsert: async (args: { where: unknown; create: { homeOrder: string[] }; update: unknown }) => {
        capture.where = args.where;
        capture.create = args.create;
        capture.update = args.update;
        return { homeOrder: args.create.homeOrder, updatedAt: new Date('2026-10-24T12:00:00.000Z') };
      },
    },
  };
  const revalidation = {
    notifyContentChanged: (tenantId: string) => {
      capture.notified = tenantId;
    },
  };
  return { service: new SiteContentService(prisma as never, revalidation as never), capture };
}

test('getLayoutForTenant: filtra pelo tenant e sem linha devolve a padrão', async () => {
  const { service, capture } = createService(null);
  const layout = await service.getLayoutForTenant(TENANT_A);
  assert.deepEqual(capture.where, { tenantId: TENANT_A });
  assert.deepEqual(layout, { home: DEFAULT, updatedAt: null });
});

test('getLayoutForTenant: normaliza a ordem guardada', async () => {
  const { service } = createService({
    homeOrder: ['youtube', 'mission'],
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  });
  const layout = await service.getLayoutForTenant(TENANT_A);
  assert.deepEqual(layout.home, ['youtube', ...DEFAULT.slice(0, -1)]);
  assert.equal(layout.updatedAt, '2026-10-20T10:00:00.000Z');
});

test('updateLayoutForTenant: grava pelo tenant e dispara a revalidação', async () => {
  const { service, capture } = createService(null);
  const reordered = ['celulas', ...DEFAULT.filter((id) => id !== 'celulas')];
  const layout = await service.updateLayoutForTenant(TENANT_A, reordered);
  assert.deepEqual(capture.where, { tenantId: TENANT_A });
  assert.deepEqual(capture.create, { tenantId: TENANT_A, homeOrder: reordered });
  assert.deepEqual(capture.update, { homeOrder: reordered });
  assert.equal(capture.notified, TENANT_A);
  assert.deepEqual(layout, { home: reordered, updatedAt: '2026-10-24T12:00:00.000Z' });
});

test('updateLayoutForTenant: ordem inválida não grava nem revalida', async () => {
  const { service, capture } = createService(null);
  await assert.rejects(
    service.updateLayoutForTenant(TENANT_A, DEFAULT.slice(1)),
    BadRequestException,
  );
  assert.equal(capture.create, undefined);
  assert.equal(capture.notified, undefined);
});

test('contrato público: devolve sections e layout.home, sem updatedAt', async () => {
  const controller = new PublicSiteContentController(
    { findBySlugOrThrow: async () => ({ id: TENANT_A }) } as never,
    {
      listPublicForTenant: async () => ({ mission: { badge: 'x' } }),
      getLayoutForTenant: async (tenantId: string) => {
        assert.equal(tenantId, TENANT_A);
        return { home: ['youtube', ...DEFAULT.slice(0, -1)], updatedAt: '2026-10-24T12:00:00.000Z' };
      },
    } as never,
  );
  const body = await controller.list('demo');
  assert.deepEqual(body, {
    sections: { mission: { badge: 'x' } },
    layout: { home: ['youtube', ...DEFAULT.slice(0, -1)] },
  });
});
