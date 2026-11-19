import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_TEMPLATE, computeSchedule } from './service-schedule';
import { WorshipServicesService } from './worship-services.service';

test('modelo padrão às 19:00: pré-culto conta para trás e o culto termina às 20:17', () => {
  const out = computeSchedule('19:00', DEFAULT_TEMPLATE.moments, []);
  assert.deepEqual(out.moments.map((m) => [m.startsAt, m.name]), [
    ['18:45', 'Pré-culto'],
    ['19:00', 'Abertura'],
    ['19:05', 'Louvor'],
    ['19:22', 'Avisos'],
    ['19:27', 'Ofertório'],
    ['19:32', 'Palavra'],
    ['20:12', 'Encerramento'],
  ]);
  assert.equal(out.endsAt, '20:17');
  assert.equal(out.worshipStartsAt, '19:05');
});

test('o louvor dura a soma dos áudios quando todas as músicas têm áudio', () => {
  const out = computeSchedule('19:00', DEFAULT_TEMPLATE.moments, [200, 200, 200]);
  assert.equal(out.moments[2].effectiveMinutes, 10);
  assert.equal(out.moments[3].startsAt, '19:15');
  assert.equal(out.moments[2].durationMinutes, 17, 'a duração digitada não é perdida');
});

test('com uma música sem áudio vale a duração do momento', () => {
  const out = computeSchedule('19:00', DEFAULT_TEMPLATE.moments, [200, null]);
  assert.equal(out.moments[2].effectiveMinutes, 17);
});

test('culto sem momentos e virada da meia-noite', () => {
  assert.deepEqual(computeSchedule('19:00', [], []), { moments: [], endsAt: '19:00', worshipStartsAt: null });
  const late = computeSchedule('23:30', [{ name: 'Vigília', kind: 'GENERIC', durationMinutes: 90 }], []);
  assert.equal(late.endsAt, '01:00');
});

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SONG_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SONG_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MOMENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function build() {
  const writes: string[] = [];
  const created: Record<string, unknown>[] = [];
  const service = {
    id: SERVICE,
    tenantId: TENANT_B,
    date: new Date('2026-11-22T00:00:00.000Z'),
    startTime: '19:00',
    name: 'Culto padrão',
    templateId: null,
    updatedAt: new Date(),
    moments: [{ id: MOMENT, serviceId: SERVICE, name: 'Louvor', kind: 'WORSHIP', durationMinutes: 17, sortOrder: 0 }],
    songs: [],
  };
  const op = (name: string) => (args: { data?: unknown }) => {
    writes.push(name);
    if (Array.isArray(args?.data)) created.push(...(args.data as Record<string, unknown>[]));
    return Promise.resolve({ ...service });
  };
  const prisma = {
    worshipService: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === SERVICE && where.tenantId === TENANT_B ? service : null,
      update: op('service.update'),
      delete: op('service.delete'),
      create: async ({ data }: { data: { moments: { create: unknown[] } } & Record<string, unknown> }) => {
        writes.push('service.create');
        return { ...service, ...data, moments: data.moments.create.map((m, i) => ({ id: `m${i}`, ...(m as object) })), songs: [] };
      },
    },
    worshipServiceMoment: { deleteMany: op('moment.deleteMany'), createMany: op('moment.createMany') },
    worshipServiceSong: { deleteMany: op('song.deleteMany'), createMany: op('song.createMany') },
    worshipSong: {
      count: async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) =>
        where.id.in.filter((id) => id === SONG_B && where.tenantId === TENANT_B).length,
    },
    worshipServiceTemplate: { findFirst: async () => null, create: op('template.create'), delete: op('template.delete') },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { svc: new WorshipServicesService(prisma as never), writes, created };
}

test('culto de outro tenant → 404 e nada é escrito', async () => {
  const { svc, writes } = build();
  const calls: Array<() => Promise<unknown>> = [
    () => svc.get(TENANT_A, SERVICE),
    () => svc.update(TENANT_A, SERVICE, { name: 'x' }),
    () => svc.remove(TENANT_A, SERVICE),
    () => svc.setMoments(TENANT_A, SERVICE, { moments: [] }),
    () => svc.setSongs(TENANT_A, SERVICE, { songIds: [SONG_A] }),
    () => svc.createTemplate(TENANT_A, { name: 'Domingo', fromServiceId: SERVICE }),
    () => svc.removeTemplate(TENANT_A, SERVICE),
    () => svc.create(TENANT_A, { date: '2026-11-22', templateId: SERVICE }),
  ];
  for (const call of calls) await assert.rejects(call(), NotFoundException);
  assert.deepEqual(writes, []);
});

test('música de outro tenant no roteiro → 400 e nada é escrito', async () => {
  const { svc, writes } = build();
  await assert.rejects(svc.setSongs(TENANT_B, SERVICE, { songIds: [SONG_B, SONG_A] }), BadRequestException);
  assert.deepEqual(writes, []);
});

test('a mesma música pode entrar duas vezes, na ordem recebida', async () => {
  const { svc, created } = build();
  await svc.setSongs(TENANT_B, SERVICE, { songIds: [SONG_B, SONG_B] });
  assert.deepEqual(created.map((c) => [c.songId, c.sortOrder]), [[SONG_B, 0], [SONG_B, 1]]);
});

test('momentos: reaproveita só id deste culto, uma vez', async () => {
  const { svc, created } = build();
  await svc.setMoments(TENANT_B, SERVICE, {
    moments: [
      { id: MOMENT, name: 'Louvor', kind: 'WORSHIP', durationMinutes: 20 },
      { id: MOMENT, name: 'Repetido', kind: 'GENERIC', durationMinutes: 5 },
      { id: SONG_A, name: 'Id de fora', kind: 'GENERIC', durationMinutes: 5 },
    ],
  });
  assert.equal(created[0].id, MOMENT);
  assert.notEqual(created[1].id, MOMENT);
  assert.notEqual(created[2].id, SONG_A);
  assert.deepEqual(created.map((c) => c.sortOrder), [0, 1, 2]);
});

test('criar culto sem modelo usa o Culto padrão; data impossível → 400', async () => {
  const { svc } = build();
  const out = await svc.create(TENANT_B, { date: '2026-11-22' });
  assert.equal(out.moments.length, 7);
  assert.equal(out.endsAt, '20:17');
  assert.equal(out.date, '2026-11-22');
  await assert.rejects(svc.create(TENANT_B, { date: '2026-02-31' }), BadRequestException);
});
