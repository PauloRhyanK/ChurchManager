import assert from 'node:assert/strict';
import test from 'node:test';
import { EventsService } from './events.service';

const row = {
  id: 'e1',
  tenantId: 't1',
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
  timeStart: null,
  timeEnd: null,
  location: null,
  imageUrl: null,
  tag: null,
  tags: [],
  published: true,
  slug: null,
  timezone: 'America/Sao_Paulo',
  registrationClosesAt: null,
  termsUrl: null,
  currency: 'BRL',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function build() {
  const notified: string[] = [];
  const prisma = {
    event: {
      create: async () => ({ id: 'e1' }),
      findFirst: async () => row,
      update: async () => row,
      delete: async () => row,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const svc = new EventsService(
    prisma as never,
    {} as never,
    { deleteFileByPublicUrl: async () => {} } as never,
    { notifyContentChanged: (t: string) => notified.push(t) } as never,
  );
  return { svc, notified };
}

test('criar, editar e excluir evento disparam a revalidação do tenant', async () => {
  const { svc, notified } = build();
  await svc.createForTenant('t1', {
    title: 'Retiro',
    date: '2026-11-01',
  } as never);
  await svc.updateForTenant('t1', 'e1', { title: 'Retiro 2' } as never);
  await svc.removeForTenant('t1', 'e1');
  assert.deepEqual(notified, ['t1', 't1', 't1']);
});

test('evento inexistente não dispara revalidação', async () => {
  const notified: string[] = [];
  const prisma = { event: { findFirst: async () => null } };
  const svc = new EventsService(
    prisma as never,
    {} as never,
    {} as never,
    { notifyContentChanged: (t: string) => notified.push(t) } as never,
  );
  await assert.rejects(() => svc.updateForTenant('t1', 'e1', { title: 'X' } as never));
  await assert.rejects(() => svc.removeForTenant('t1', 'e1'));
  assert.deepEqual(notified, []);
});
