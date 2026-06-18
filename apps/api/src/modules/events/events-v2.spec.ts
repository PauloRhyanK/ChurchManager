import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { EventTicketTypesService } from './event-ticket-types.service';
import { EventTagsService, slugifyTag } from './event-tags.service';
import { collectFieldValues } from './event-field-validation.util';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function ticketRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    tenantId: TENANT_A,
    eventId: EVENT_A,
    name: 'Inteira',
    description: null,
    priceCents: 1000,
    feeCents: 0,
    quantityTotal: null,
    quantitySold: 0,
    minPerOrder: 1,
    maxPerOrder: 10,
    salesOpensAt: null,
    salesClosesAt: null,
    visibility: 'PUBLIC',
    allowGuestRegistration: true,
    communityLink: null,
    allowedBillingTypes: ['PIX'],
    maxInstallments: null,
    active: true,
    fieldConfigs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

test('listPublicForEvent filtra visibility PUBLIC e evento publicado', async () => {
  const capture: { where?: Record<string, unknown> } = {};
  const prisma = {
    event: { findFirst: async () => ({ id: EVENT_A }) },
    eventTicketType: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capture.where = where;
        return [];
      },
    },
  };
  const service = new EventTicketTypesService(prisma as never);
  await service.listPublicForEvent(TENANT_A, EVENT_A, 'BRL');
  assert.equal(capture.where?.visibility, 'PUBLIC');
  assert.equal(capture.where?.active, true);
});

test('getPublicById devolve ingresso privado por link directo', async () => {
  const prisma = {
    event: { findFirst: async () => ({ id: EVENT_A }) },
    eventTicketType: {
      findFirst: async () => ticketRow({ visibility: 'PRIVATE' }),
    },
  };
  const service = new EventTicketTypesService(prisma as never);
  const dto = await service.getPublicById(TENANT_A, EVENT_A, 't1');
  assert.equal(dto.visibility, 'PRIVATE');
  assert.equal(dto.id, 't1');
});

test('duplicateForEvent clona config e campos zerando vendas', async () => {
  let created: Record<string, unknown> | undefined;
  const fieldRows = [
    { ticketTypeId: 't1', fieldId: 'f1', enabled: true, required: true, sortOrder: 0 },
  ];
  let createManyData: unknown;
  const prisma = {
    eventTicketType: {
      findFirst: async () =>
        ticketRow({
          quantitySold: 5,
          fieldConfigs: fieldRows.map((r) => ({
            ...r,
            field: { id: r.fieldId, key: 'cpf', label: 'CPF', type: 'CPF', options: null, isSystem: true },
          })),
        }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: 't2' };
      },
    },
    eventTicketTypeField: {
      createMany: async ({ data }: { data: unknown }) => {
        createManyData = data;
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  // getById após criar
  (prisma.eventTicketType as Record<string, unknown>).findFirst = (() => {
    let calls = 0;
    return async () => {
      calls += 1;
      if (calls === 1) {
        return ticketRow({
          quantitySold: 5,
          fieldConfigs: fieldRows.map((r) => ({
            ...r,
            field: { id: r.fieldId, key: 'cpf', label: 'CPF', type: 'CPF', options: null, isSystem: true },
          })),
        });
      }
      return ticketRow({ id: 't2', name: 'Inteira (cópia)' });
    };
  })();

  const service = new EventTicketTypesService(prisma as never);
  const dto = await service.duplicateForEvent(TENANT_A, EVENT_A, 't1');
  assert.equal(created?.name, 'Inteira (cópia)');
  assert.ok(!('quantitySold' in (created ?? {})));
  assert.deepEqual(createManyData, [
    { ticketTypeId: 't2', fieldId: 'f1', enabled: true, required: true, sortOrder: 0 },
  ]);
  assert.equal(dto.id, 't2');
});

test('slugifyTag normaliza acentos e espaços', () => {
  assert.equal(slugifyTag('  Retiro de Jovens '), 'retiro-de-jovens');
  assert.equal(slugifyTag('Ação Social!'), 'acao-social');
});

test('ensureTagIds deduplica por slug', async () => {
  const upserts: string[] = [];
  const client = {
    eventTag: {
      upsert: async ({ where }: { where: { tenantId_slug: { slug: string } } }) => {
        upserts.push(where.tenantId_slug.slug);
        return { id: `id-${where.tenantId_slug.slug}` };
      },
    },
  };
  const service = new EventTagsService(client as never);
  const ids = await service.ensureTagIds(client as never, TENANT_A, [
    'Culto',
    'culto',
    'CULTO',
    'Retiro',
  ]);
  assert.deepEqual(upserts, ['culto', 'retiro']);
  assert.equal(ids.length, 2);
});

test('collectFieldValues exige campos obrigatórios não-sistema', () => {
  const requirements = [
    { fieldId: 'f1', key: 'custom_empresa', label: 'Empresa', enabled: true, required: true },
  ];
  assert.throws(
    () => collectFieldValues(requirements, []),
    (err: unknown) => err instanceof BadRequestException,
  );
  const ok = collectFieldValues(requirements, [{ fieldId: 'f1', value: 'ACME' }]);
  assert.deepEqual(ok, [{ fieldId: 'f1', value: 'ACME' }]);
});

test('collectFieldValues ignora campos do sistema e desactivados', () => {
  const requirements = [
    { fieldId: 'name', key: 'name', label: 'Nome', enabled: true, required: true },
    { fieldId: 'f2', key: 'custom_x', label: 'X', enabled: false, required: true },
  ];
  // name é satisfeito fora; f2 está desactivado → não exige
  const result = collectFieldValues(requirements, [{ fieldId: 'f2', value: 'ignorado' }]);
  assert.deepEqual(result, []);
});
