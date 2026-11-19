import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_TEMPLATE, computeSchedule } from './service-schedule';
import { WorshipServicesService } from './worship-services.service';

test('modelo padrão às 19:00: pré-culto conta para trás e o culto termina às 20:17', () => {
  const out = computeSchedule('19:00', DEFAULT_TEMPLATE.moments);
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

test('música com áudio dura o áudio, contado em segundos; sem áudio, a duração do item', () => {
  const out = computeSchedule('19:00', [
    { name: 'Abertura', kind: 'GENERIC', durationMinutes: 3 },
    { name: 'Céu aberto', kind: 'SONG', durationMinutes: 5, songSeconds: 250 },
    { name: 'Nada nos separa', kind: 'SONG', durationMinutes: 5, songSeconds: 250 },
    { name: 'Oração', kind: 'GENERIC', durationMinutes: 3 },
    { name: 'Espaço', kind: 'SONG', durationMinutes: 6, songSeconds: null },
    { name: 'Encerramento', kind: 'GENERIC', durationMinutes: 2 },
  ]);
  assert.deepEqual(out.moments.map((m) => [m.startsAt, m.effectiveMinutes]), [
    ['19:00', 3], ['19:03', 4], ['19:07', 4], ['19:11', 3], ['19:14', 6], ['19:20', 2],
  ]);
  // 2 × 250 s = 8:20, não 2 × 5 min.
  assert.equal(out.endsAt, '19:22');
  assert.equal(out.worshipStartsAt, '19:03');
});

test('culto sem momentos e virada da meia-noite', () => {
  assert.deepEqual(computeSchedule('19:00', []), { moments: [], endsAt: '19:00', worshipStartsAt: null });
  const late = computeSchedule('23:30', [{ name: 'Vigília', kind: 'GENERIC', durationMinutes: 90 }]);
  assert.equal(late.endsAt, '01:00');
});

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SONG_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SONG_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MOMENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

type Slides = { title: string; preacherName: string; slideStyle: string; slides: unknown[]; mySermonId: string | null };

function build(
  sermon: { title: string; preacherName: string; estimatedMinutes: number; slideCount: number } | null = null,
  slides: Slides | null = null,
) {
  const writes: string[] = [];
  const calls: string[] = [];
  let inTx = false;
  const created: Record<string, unknown>[] = [];
  const mirror: Record<string, unknown>[] = [];
  const service = {
    id: SERVICE,
    tenantId: TENANT_B,
    date: new Date('2026-11-22T00:00:00.000Z'),
    startTime: '19:00',
    name: 'Culto padrão',
    templateId: null,
    updatedAt: new Date(),
    moments: [
      { id: MOMENT, serviceId: SERVICE, name: 'Louvor', kind: 'WORSHIP', durationMinutes: 17, sortOrder: 0, songId: null, song: null },
    ] as Record<string, unknown>[],
  };
  const op = (name: string) => (args: { data?: unknown }) => {
    writes.push(name);
    if (Array.isArray(args?.data)) created.push(...(args.data as Record<string, unknown>[]));
    return Promise.resolve({ ...service });
  };
  const prisma = {
    worshipService: {
      findMany: async () => [{ ...service, _count: { songs: 0 } }],
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === SERVICE && where.tenantId === TENANT_B ? service : null,
      update: op('service.update'),
      delete: (args: unknown) => {
        calls.push('service.delete');
        return op('service.delete')(args as never);
      },
      create: async ({ data }: { data: { moments: { create: unknown[] } } & Record<string, unknown> }) => {
        writes.push('service.create');
        return { ...service, ...data, moments: data.moments.create.map((m, i) => ({ id: `m${i}`, songId: null, song: null, ...(m as object) })) };
      },
    },
    worshipServiceMoment: { deleteMany: op('moment.deleteMany'), createMany: op('moment.createMany') },
    worshipServiceSong: {
      deleteMany: op('song.deleteMany'),
      createMany: (args: { data: Record<string, unknown>[] }) => {
        writes.push('song.createMany');
        mirror.push(...args.data);
        return Promise.resolve({});
      },
    },
    worshipSong: {
      findMany: async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => id === SONG_B && where.tenantId === TENANT_B)
          .map((id) => ({ id, title: 'Rio de paz', audioDurationSeconds: 250 })),
    },
    worshipServiceTemplate: { findFirst: async () => null, create: op('template.create'), delete: op('template.delete') },
    $transaction: async (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
      if (typeof arg !== 'function') return Promise.all(arg);
      inTx = true;
      try {
        return await arg(prisma);
      } finally {
        inTx = false;
      }
    },
  };
  const rec = (name: string) => async (...args: unknown[]) => {
    calls.push(`${name}${inTx ? '@tx' : ''}:${JSON.stringify(args.slice(1))}`);
  };
  const deliveries = {
    rematch: rec('rematch'),
    followService: rec('follow'),
    releaseService: rec('release'),
    summaries: async (_t: string, ids: string[]) => new Map(sermon ? ids.map((i) => [i, sermon] as const) : []),
    slidesForService: async (tenantId: string, serviceId: string, viewer: string) => {
      calls.push(`slides:${JSON.stringify([tenantId, serviceId, viewer])}`);
      return slides ? { ...slides, extra: 'não sai' } : null;
    },
  };
  return { svc: new WorshipServicesService(prisma as never, deliveries as never), writes, created, mirror, calls, service };
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

test('só as músicas: a primeira vez, entram no lugar do bloco Louvor; a mesma música pode entrar duas vezes', async () => {
  const { svc, created, mirror } = build();
  await svc.setSongs(TENANT_B, SERVICE, { songIds: [SONG_B, SONG_B] });
  assert.deepEqual(created.map((c) => [c.kind, c.songId, c.sortOrder, c.name, c.durationMinutes]), [
    ['SONG', SONG_B, 0, 'Rio de paz', 5],
    ['SONG', SONG_B, 1, 'Rio de paz', 5],
  ]);
  // O espelho acompanha a ordem dos itens de música.
  assert.deepEqual(mirror.map((m) => [m.songId, m.sortOrder]), [[SONG_B, 0], [SONG_B, 1]]);
});

test('roteiro intercalado: música no meio dos momentos; música só em item de música', async () => {
  const { svc, created, mirror } = build();
  await svc.setMoments(TENANT_B, SERVICE, {
    moments: [
      { name: 'Abertura', kind: 'GENERIC', durationMinutes: 3 },
      { name: 'x', kind: 'SONG', durationMinutes: 5, songId: SONG_B },
      { name: 'Oração', kind: 'GENERIC', durationMinutes: 3 },
      { name: 'Música', kind: 'SONG', durationMinutes: 5 },
    ],
  });
  assert.deepEqual(created.map((c) => [c.kind, c.songId, c.name]), [
    ['GENERIC', null, 'Abertura'],
    ['SONG', SONG_B, 'Rio de paz'],
    ['GENERIC', null, 'Oração'],
    ['SONG', null, 'Música'],
  ]);
  assert.equal(mirror.length, 1);
  const again = build();
  await assert.rejects(
    again.svc.setMoments(TENANT_B, SERVICE, { moments: [{ name: 'Avisos', kind: 'GENERIC', durationMinutes: 5, songId: SONG_B }] }),
    BadRequestException,
  );
  await assert.rejects(
    again.svc.setMoments(TENANT_B, SERVICE, { moments: [{ name: 'x', kind: 'SONG', durationMinutes: 5, songId: SONG_A }] }),
    BadRequestException,
  );
  assert.deepEqual(again.writes, []);
});

test('modelo a partir do culto guarda o lugar da música, não a música', async () => {
  const { svc, service, writes } = build();
  service.moments = [
    { id: MOMENT, name: 'Rio de paz', kind: 'SONG', durationMinutes: 5, sortOrder: 0, songId: SONG_B, song: null },
  ];
  const out = await svc.createTemplate(TENANT_B, { name: 'Domingo', fromServiceId: SERVICE });
  assert.deepEqual(out.moments, [{ name: 'Música', kind: 'SONG', durationMinutes: 5 }]);
  assert.ok(writes.includes('template.create'));
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

test('criar culto roda rematch com a data dele, dentro da transação', async () => {
  const { svc, calls } = build();
  await svc.create(TENANT_B, { date: '2026-11-29' });
  assert.deepEqual(calls.filter((c) => c.startsWith('rematch')), [`rematch@tx:["${TENANT_B}",["2026-11-29"]]`]);
});

test('mudar data chama followService e rematch com as duas datas; mudar só o nome não chama nenhum', async () => {
  const a = build();
  await a.svc.update(TENANT_B, SERVICE, { date: '2026-11-29' });
  assert.ok(a.calls.some((c) => c.startsWith('follow@tx')));
  assert.ok(a.calls.includes(`rematch@tx:["${TENANT_B}",["2026-11-22","2026-11-29"]]`));
  const b = build();
  await b.svc.update(TENANT_B, SERVICE, { startTime: '10:00' });
  assert.ok(b.calls.some((c) => c.startsWith('follow@tx')));
  const c = build();
  await c.svc.update(TENANT_B, SERVICE, { name: 'Outro nome' });
  await c.svc.update(TENANT_B, SERVICE, { date: '2026-11-22', startTime: '19:00' });
  assert.deepEqual(c.calls, []);
});

test('apagar libera o envio antes do delete e roda rematch depois', async () => {
  const { svc, calls } = build();
  await svc.remove(TENANT_B, SERVICE);
  assert.deepEqual(calls.map((c) => c.split(':')[0]), ['release@tx', 'service.delete', 'rematch@tx']);
});

test('get traz sermon com exatamente quatro chaves, ou null sem envio; list traz hasSermon', async () => {
  const sermon = { title: 'Graça', preacherName: 'Paulo', estimatedMinutes: 30, slideCount: 7 };
  const withSermon = build(sermon);
  const got = await withSermon.svc.get(TENANT_B, SERVICE);
  assert.deepEqual(Object.keys(got.sermon!).sort(), ['estimatedMinutes', 'preacherName', 'slideCount', 'title']);
  assert.equal(got.sermon!.slideCount, 7);
  assert.equal((await build().svc.get(TENANT_B, SERVICE)).sermon, null);
  assert.equal((await withSermon.svc.list(TENANT_B)).items[0].hasSermon, true);
  assert.equal((await build().svc.list(TENANT_B)).items[0].hasSermon, false);
});

test('prévia da palavra: 404 sem envio; com envio, só as cinco chaves, pelo tenant e usuário de quem chama', async () => {
  const none = build();
  await assert.rejects(
    none.svc.sermonSlides(TENANT_B, SERVICE, 'u1'),
    (e: any) => e instanceof NotFoundException && e.message === 'Este culto não tem palavra.',
  );
  const slides = { title: 'Graça', preacherName: 'Paulo', slideStyle: 'MINIMAL', slides: [{ kind: 'VERSE', text: 'a', reference: 'b' }], mySermonId: null };
  const withSlides = build(null, slides);
  const out = await withSlides.svc.sermonSlides(TENANT_B, SERVICE, 'u1');
  assert.deepEqual(Object.keys(out).sort(), ['mySermonId', 'preacherName', 'slideStyle', 'slides', 'title']);
  assert.deepEqual(out, slides);
  assert.deepEqual(withSlides.calls, [`slides:${JSON.stringify([TENANT_B, SERVICE, 'u1'])}`]);
  assert.deepEqual(withSlides.writes, []);
});
