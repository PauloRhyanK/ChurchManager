import assert from 'node:assert/strict';
import test from 'node:test';
import { EventsService } from './events.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const row = {
  id: EVENT,
  tenantId: TENANT,
  title: 'Retiro',
  description: null,
  format: 'IN_PERSON',
  onlineUrl: null,
  shortDescription: null,
  detailsHtml: null,
  videoUrl: null,
  coverImageUrl: null,
  mediaMeta: null,
  date: new Date(Date.UTC(2026, 10, 1)),
  timeStart: new Date(Date.UTC(1970, 0, 1, 19, 30)),
  timeEnd: new Date(Date.UTC(1970, 0, 1, 21, 0)),
  location: null,
  imageUrl: null,
  tag: null,
  tags: [],
  published: false,
  slug: null,
  timezone: 'America/Sao_Paulo',
  registrationClosesAt: null,
  termsUrl: null,
  currency: 'BRL',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function build() {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const prisma = {
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: EVENT };
      },
      findFirst: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updated.push(data);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const service = new EventsService(
    prisma as never,
    {} as never,
    { deleteFileByPublicUrl: async () => {} } as never,
    { notifyContentChanged: () => {} } as never,
  );
  return { service, created, updated };
}

test('createForTenant: sem published o evento nasce rascunho', async () => {
  const { service, created } = build();
  await service.createForTenant(TENANT, { title: 'Retiro', date: '2026-11-01' });
  assert.equal(created[0].published, false);
});

test('createForTenant: published: true explícito publica', async () => {
  const { service, created } = build();
  await service.createForTenant(TENANT, {
    title: 'Retiro',
    date: '2026-11-01',
    published: true,
  });
  assert.equal(created[0].published, true);
});

test('createForTenant: horário null ou ausente grava null', async () => {
  const { service, created } = build();
  await service.createForTenant(TENANT, {
    title: 'Retiro',
    date: '2026-11-01',
    timeStart: null,
  });
  assert.equal(created[0].timeStart, null);
  assert.equal(created[0].timeEnd, null);
});

test('createForTenant: horário preenchido é convertido', async () => {
  const { service, created } = build();
  await service.createForTenant(TENANT, {
    title: 'Retiro',
    date: '2026-11-01',
    timeStart: '19:30',
  });
  assert.deepEqual(created[0].timeStart, new Date(Date.UTC(1970, 0, 1, 19, 30)));
});

test('updateForTenant: timeStart/timeEnd null limpam o horário', async () => {
  const { service, updated } = build();
  await service.updateForTenant(TENANT, EVENT, { timeStart: null, timeEnd: null });
  assert.ok('timeStart' in updated[0]);
  assert.equal(updated[0].timeStart, null);
  assert.ok('timeEnd' in updated[0]);
  assert.equal(updated[0].timeEnd, null);
});

test('updateForTenant: sem os campos de horário não os altera', async () => {
  const { service, updated } = build();
  await service.updateForTenant(TENANT, EVENT, { title: 'Retiro 2' });
  assert.equal('timeStart' in updated[0], false);
  assert.equal('timeEnd' in updated[0], false);
});

test('updateForTenant: horário novo é convertido', async () => {
  const { service, updated } = build();
  await service.updateForTenant(TENANT, EVENT, { timeStart: '08:15:30' });
  assert.deepEqual(
    updated[0].timeStart,
    new Date(Date.UTC(1970, 0, 1, 8, 15, 30)),
  );
  assert.equal('timeEnd' in updated[0], false);
});
