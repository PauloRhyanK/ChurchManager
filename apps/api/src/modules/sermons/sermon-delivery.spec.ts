import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import type { AuthUser } from '../auth/auth-user';
import { DeliveryPreviewQuery, SendSermonDto } from './dto/delivery.dto';
import { EXAMPLE_DOC } from './sermon-example';
import { buildSlides } from './sermon-slides';
import { SermonDeliveryService } from './sermon-delivery.service';
import { SermonsService } from './sermons.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTHOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-11-20T12:00:00.000Z'); // sexta 09:00 em Brasília
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const SV_A = '33333333-3333-4333-8333-333333333331';
const SV_B = '33333333-3333-4333-8333-333333333332';
const SV_OTHER_TENANT = '33333333-3333-4333-8333-333333333339';

const user = (over: Partial<AuthUser> = {}) =>
  ({ userId: AUTHOR, tenantId: TENANT, email: 'p@x.com', role: 'MEMBER', ...over }) as AuthUser;

type Row = Record<string, any>;
const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const sermonRow = (id: string, over: Row = {}): Row => ({
  id, tenantId: TENANT, authorId: AUTHOR, title: `Palavra ${id.slice(0, 2)}`, document: {}, revision: 1,
  baseReference: null, pointCount: 0, verseRefs: '', estimatedSeconds: 601,
  slideMode: null, slideStyle: 'MINIMAL', slides: [], slidesRevision: null,
  createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-10T00:00:00Z'), ...over,
});
const serviceRow = (id: string, date: string, startTime: string, over: Row = {}): Row => ({
  id, tenantId: TENANT, date: d(date), startTime, name: `Culto ${startTime}`, ...over,
});
let seq = 0;
const deliveryRow = (over: Row): Row => ({
  id: `eeeeeeee-eeee-4eee-8eee-${String(++seq).padStart(12, '0')}`,
  tenantId: TENANT, sermonId: null, authorId: AUTHOR, serviceId: null, pinned: false,
  title: 'T', preacherName: 'Pr', estimatedSeconds: 60, slideStyle: 'MINIMAL', slides: [], createdAt: new Date('2026-11-05T00:00:00Z'), ...over,
});

function build(init: { sermons?: Row[]; services?: Row[]; deliveries?: Row[] }) {
  const sermons = (init.sermons ?? []).map((s) => ({ ...s }));
  const services = (init.services ?? []).map((s) => ({ ...s }));
  const deliveries = (init.deliveries ?? []).map((x) => ({ ...x }));
  const writes: string[] = [];
  const snapshot = () => JSON.stringify(deliveries);
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('gte' in v) return row[k] >= v.gte;
        if ('gt' in v) return row[k] > v.gt;
        return true;
      }
      if (v instanceof Date) return row[k]?.getTime() === v.getTime();
      return row[k] === v;
    });
  const checkUnique = () => {
    for (const key of ['sermonId', 'serviceId']) {
      const seen = new Set<string>();
      for (const x of deliveries) {
        if (x[key] == null) continue;
        if (seen.has(x[key])) throw new Error(`unique violation ${key}`);
        seen.add(x[key]);
      }
    }
  };
  const withService = (x: Row) => ({ ...x, service: services.find((s) => s.id === x.serviceId) ?? null });
  const prisma: Row = {
    adminUser: { findFirst: async () => ({ name: 'Pastor Paulo' }) },
    sermon: {
      findFirst: async ({ where }: Row) => {
        const s = sermons.find((r) => matches(r, where));
        if (!s) return null;
        const dl = deliveries.find((x) => x.sermonId === s.id);
        return { ...s, delivery: dl ? withService(dl) : null };
      },
      deleteMany: async ({ where }: Row) => {
        const i = sermons.findIndex((r) => matches(r, where));
        if (i < 0) return { count: 0 };
        writes.push('sermon.delete');
        sermons.splice(i, 1);
        // sermon_id SetNull: o envio passado fica, sem a palavra.
        deliveries.filter((x) => x.sermonId === where.id).forEach((x) => (x.sermonId = null));
        return { count: 1 };
      },
    },
    worshipService: {
      findFirst: async ({ where }: Row) => services.find((s) => matches(s, where)) ?? null,
      findMany: async ({ where, take }: Row) => {
        const rows = services.filter((s) => matches(s, where))
          .sort((a, b) => a.date.getTime() - b.date.getTime() || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
          .map((s) => ({ ...s, sermonDelivery: deliveries.find((x) => x.serviceId === s.id) ?? null }));
        return take ? rows.slice(0, take) : rows;
      },
    },
    sermonDelivery: {
      findFirst: async ({ where }: Row) => deliveries.find((x) => matches(x, where)) ?? null,
      findMany: async ({ where }: Row) => deliveries.filter((x) => matches(x, where)).map((x) => ({ ...x })),
      create: async ({ data }: Row) => {
        writes.push('delivery.create');
        const row = deliveryRow({ ...data });
        deliveries.push(row); checkUnique(); return row;
      },
      update: async ({ where, data }: Row) => {
        writes.push('delivery.update');
        const row = deliveries.find((x) => x.id === where.id)!;
        Object.assign(row, data); checkUnique(); return row;
      },
      updateMany: async ({ where, data }: Row) => {
        writes.push('delivery.updateMany');
        const rows = deliveries.filter((x) => matches(x, where));
        rows.forEach((r) => Object.assign(r, data)); checkUnique();
        return { count: rows.length };
      },
      delete: async ({ where }: Row) => {
        writes.push('delivery.delete');
        const i = deliveries.findIndex((x) => x.id === where.id);
        const [gone] = deliveries.splice(i, 1);
        return gone;
      },
    },
    $transaction: async (fn: (tx: Row) => unknown) => {
      const before = snapshot();
      try { return await fn(prisma); } catch (e) {
        const restored = JSON.parse(before, (k, v) => (['date', 'createdAt'].includes(k) ? new Date(v) : v));
        deliveries.splice(0, deliveries.length, ...restored);
        throw e;
      }
    },
  };
  const sermonsService = new SermonsService(prisma as never);
  sermonsService.clock = () => NOW;
  const service = new SermonDeliveryService(prisma as never, sermonsService);
  return { service, sermons, services, deliveries, writes, sermonsService };
}

const SERVICES = () => [
  serviceRow(SV_A, '2026-11-22', '09:00'),
  serviceRow(SV_B, '2026-11-22', '19:00'),
  serviceRow(SV_OTHER_TENANT, '2026-11-22', '10:00', { tenantId: OTHER_TENANT }),
];

test('envia para um culto da lista: pinned, data e hora do culto, situação SENT e nome do pregador', async () => {
  const { service, deliveries } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  const out = await service.send(user(), S1, { serviceId: SV_B });
  assert.equal(out.status, 'SENT');
  assert.deepEqual(out.delivery, { date: '2026-11-22', startTime: '19:00', serviceId: SV_B, serviceName: 'Culto 19:00' });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].pinned, true);
  assert.equal(deliveries[0].preacherName, 'Pastor Paulo');
  assert.equal(deliveries[0].estimatedSeconds, 601);
});

test('culto de outro tenant e palavra de outro autor dão 404 sem escrever', async () => {
  const { service, writes, deliveries } = build({ sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })], services: SERVICES() });
  await assert.rejects(service.send(user(), S1, { serviceId: SV_OTHER_TENANT }), NotFoundException);
  await assert.rejects(service.send(user(), S2, { serviceId: SV_B }), NotFoundException);
  await assert.rejects(service.cancel(user(), S2), NotFoundException);
  assert.deepEqual(writes, []);
  assert.equal(deliveries.length, 0);
});

test('culto com palavra de outro dá 409 SERVICE_HAS_SERMON e nada é escrito; com replace o outro envio some', async () => {
  const mk = () => build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: SERVICES(),
    deliveries: [deliveryRow({ id: 'x1', sermonId: S2, authorId: OTHER, serviceId: SV_B, pinned: true, date: d('2026-11-22'), startTime: '19:00' })],
  });
  const a = mk();
  await assert.rejects(a.service.send(user(), S1, { serviceId: SV_B }), (e: any) => {
    assert.ok(e instanceof ConflictException);
    assert.deepEqual(e.getResponse(), { code: 'SERVICE_HAS_SERMON', message: 'Este culto já tem uma palavra.' });
    return true;
  });
  assert.deepEqual(a.writes, []);
  assert.equal(a.deliveries.length, 1);

  const b = mk();
  await b.service.send(user(), S1, { serviceId: SV_B, replace: true });
  assert.equal(b.deliveries.length, 1);
  assert.equal(b.deliveries[0].sermonId, S1);
  // a palavra do outro volta a Rascunho: sem envio
  const other = await b.sermonsService.get(user({ userId: OTHER }), S2);
  assert.equal(other.status, 'DRAFT');
});

test('reenviar a mesma palavra ao culto que já a tem não é conflito', async () => {
  const { service, deliveries } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  await service.send(user(), S1, { serviceId: SV_B });
  await service.send(user(), S1, { serviceId: SV_B });
  assert.equal(deliveries.length, 1);
});

test('reenviar para outro culto move (um envio só) e roda rematch na data antiga', async () => {
  const { service, deliveries } = build({
    sermons: [sermonRow(S1), sermonRow(S2)],
    services: [...SERVICES(), serviceRow('33333333-3333-4333-8333-333333333340', '2026-11-29', '19:00')],
    deliveries: [deliveryRow({ id: 'g', sermonId: S2, serviceId: null, pinned: false, date: d('2026-11-22'), startTime: '19:00', createdAt: new Date('2026-11-06T00:00:00Z') })],
  });
  await service.send(user(), S1, { serviceId: SV_B }); // ocupa o culto 19:00
  const g = deliveries.find((x) => x.id === 'g')!;
  assert.equal(g.serviceId, null); // S2 estava guardada; o pinned tomou o culto
  await service.send(user(), S1, { serviceId: '33333333-3333-4333-8333-333333333340' });
  assert.equal(deliveries.filter((x) => x.sermonId === S1).length, 1);
  assert.equal(deliveries.find((x) => x.sermonId === S1)!.date.toISOString().slice(0, 10), '2026-11-29');
  assert.equal(g.serviceId, SV_B); // rematch da data antiga devolveu o culto à disputa
});

test('"Outra data" sem culto no dia fica guardada, sem culto', async () => {
  const { service, deliveries } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  const out = await service.send(user(), S1, { date: '2026-12-06', startTime: '19:00' });
  assert.equal(out.status, 'SENT');
  assert.equal(deliveries[0].pinned, false);
  assert.equal(deliveries[0].serviceId, null);
  assert.equal(out.delivery?.serviceId, null);
});

test('"Outra data" com um culto livre no dia casa na hora', async () => {
  const { service, deliveries } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  const out = await service.send(user(), S1, { date: '2026-11-22', startTime: '18:30' });
  assert.equal(deliveries[0].serviceId, SV_B);
  assert.equal(deliveries[0].pinned, false);
  assert.equal(out.delivery?.serviceName, 'Culto 19:00');
});

test('"Outra data" cujo culto mais próximo está ocupado dá 409 e desfaz; com replace toma o culto', async () => {
  const mk = () => build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: SERVICES(),
    deliveries: [deliveryRow({ id: 'x1', sermonId: S2, authorId: OTHER, serviceId: SV_B, pinned: false, date: d('2026-11-22'), startTime: '19:00' })],
  });
  const a = mk();
  await assert.rejects(a.service.send(user(), S1, { date: '2026-11-22', startTime: '19:30' }), (e: any) => e instanceof ConflictException && (e.getResponse() as any).code === 'SERVICE_HAS_SERMON');
  assert.equal(a.deliveries.length, 1);

  const b = mk();
  await b.service.send(user(), S1, { date: '2026-11-22', startTime: '19:30', replace: true });
  assert.equal(b.deliveries.length, 1);
  assert.equal(b.deliveries[0].sermonId, S1);
  assert.equal(b.deliveries[0].serviceId, SV_B);
  assert.equal(b.deliveries[0].pinned, true);
});

test('corpo sem destino ou com os dois destinos dá 400', async () => {
  const { service } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  for (const dto of [{}, { serviceId: null as never }, { date: '2026-11-22' }, { startTime: '19:00' }, { serviceId: SV_A, date: '2026-11-22', startTime: '19:00' }, { serviceId: SV_A, date: '2026-11-22' }]) {
    await assert.rejects(service.send(user(), S1, dto), (e: any) => e instanceof BadRequestException && /Escolha um culto/.test(e.message));
  }
  await assert.rejects(service.send(user(), S1, { date: '2026-02-30', startTime: '19:00' }), BadRequestException);
});

test('cancel apaga o envio e devolve a palavra a Rascunho', async () => {
  const { service, deliveries } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  await service.send(user(), S1, { serviceId: SV_B });
  const out = await service.cancel(user(), S1);
  assert.equal(out.status, 'DRAFT');
  assert.equal(deliveries.length, 0);
});

test('followService muda a data do envio pinned e não a do não pinned', async () => {
  const { service, deliveries } = build({
    services: SERVICES(),
    deliveries: [
      deliveryRow({ id: 'p', serviceId: SV_A, pinned: true, date: d('2026-11-22'), startTime: '09:00' }),
      deliveryRow({ id: 'n', serviceId: SV_B, pinned: false, date: d('2026-11-22'), startTime: '19:00' }),
    ],
  });
  await service.followService((service as any).prisma, TENANT, { id: SV_A, date: '2026-11-23', startTime: '08:30' });
  await service.followService((service as any).prisma, TENANT, { id: SV_B, date: '2026-11-23', startTime: '20:00' });
  const p = deliveries.find((x) => x.id === 'p')!;
  const n = deliveries.find((x) => x.id === 'n')!;
  assert.equal(p.date.toISOString().slice(0, 10), '2026-11-23');
  assert.equal(p.startTime, '08:30');
  assert.equal(n.date.toISOString().slice(0, 10), '2026-11-22');
  assert.equal(n.startTime, '19:00');
});

test('releaseService + rematch devolve o envio à disputa', async () => {
  const { service, deliveries } = build({
    services: SERVICES(),
    deliveries: [deliveryRow({ id: 'p', serviceId: SV_B, pinned: true, date: d('2026-11-22'), startTime: '19:00' })],
  });
  const tx = (service as any).prisma;
  await service.releaseService(tx, TENANT, SV_B);
  assert.equal(deliveries[0].pinned, false);
  assert.equal(deliveries[0].serviceId, null);
  await service.rematch(tx, TENANT, ['2026-11-22']);
  assert.equal(deliveries[0].serviceId, SV_B);
});

test('rematch troca envios entre cultos sem violar a unicidade', async () => {
  const { service, deliveries } = build({
    services: SERVICES(),
    deliveries: [
      deliveryRow({ id: 'a', serviceId: SV_A, date: d('2026-11-22'), startTime: '19:00', createdAt: new Date('2026-11-01T00:00:00Z') }),
      deliveryRow({ id: 'b', serviceId: SV_B, date: d('2026-11-22'), startTime: '09:00', createdAt: new Date('2026-11-02T00:00:00Z') }),
    ],
  });
  await service.rematch((service as any).prisma, TENANT, ['2026-11-22', '2026-11-22']);
  assert.equal(deliveries.find((x) => x.id === 'a')!.serviceId, SV_B);
  assert.equal(deliveries.find((x) => x.id === 'b')!.serviceId, SV_A);
});

test('summaries devolve só título, pregador, minutos (arredondados para cima) e slideCount', async () => {
  const { service } = build({
    services: SERVICES(),
    deliveries: [deliveryRow({ serviceId: SV_B, title: 'Luz', preacherName: 'Paulo', estimatedSeconds: 601, sermonId: S1 })],
  });
  const map = await service.summaries(TENANT, [SV_A, SV_B]);
  assert.deepEqual([...map.keys()], [SV_B]);
  assert.deepEqual(map.get(SV_B), { title: 'Luz', preacherName: 'Paulo', estimatedMinutes: 11, slideCount: 0 });
  assert.equal((await service.summaries(TENANT, [])).size, 0);
});

test('serviceOptions: cultos futuros do tenant, com hasSermon e isMine', async () => {
  const { service } = build({
    services: [...SERVICES(), serviceRow('33333333-3333-4333-8333-333333333350', '2026-11-19', '19:00')],
    deliveries: [deliveryRow({ serviceId: SV_B, authorId: AUTHOR, sermonId: S1, pinned: true })],
  });
  const out = await service.serviceOptions(user());
  assert.deepEqual(out.map((o) => o.id), [SV_A, SV_B]);
  assert.deepEqual(out[0], { id: SV_A, date: '2026-11-22', startTime: '09:00', name: 'Culto 09:00', hasSermon: false, isMine: false });
  assert.deepEqual(out[1], { id: SV_B, date: '2026-11-22', startTime: '19:00', name: 'Culto 19:00', hasSermon: true, isMine: true });
});

test('preview: culto mais próximo e se está ocupado', async () => {
  const { service } = build({
    services: SERVICES(),
    deliveries: [deliveryRow({ serviceId: SV_B, sermonId: S1 })],
  });
  const near = await service.preview(TENANT, '2026-11-22', '19:10');
  assert.deepEqual(near, { service: { id: SV_B, date: '2026-11-22', startTime: '19:00', name: 'Culto 19:00' }, occupied: true });
  assert.equal((await service.preview(TENANT, '2026-11-22', '08:00')).occupied, false);
  assert.deepEqual(await service.preview(TENANT, '2026-12-25', '19:00'), { service: null, occupied: false });
});

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
const parse = (metatype: Type<unknown>, body: unknown, type: 'body' | 'query' = 'body') => pipe.transform(body, { type, metatype });

test('DTOs recusam pinned, authorId, title e formatos inválidos', async () => {
  for (const extra of [{ pinned: true }, { authorId: AUTHOR }, { title: 'x' }, { tenantId: TENANT }]) {
    await assert.rejects(parse(SendSermonDto, { serviceId: SV_A, ...extra }), BadRequestException);
  }
  await assert.rejects(parse(SendSermonDto, { serviceId: 'nope' }), BadRequestException);
  await assert.rejects(parse(SendSermonDto, { date: '22/11/2026', startTime: '19:00' }), BadRequestException);
  await assert.rejects(parse(SendSermonDto, { date: '2026-11-22', startTime: '25:00' }), BadRequestException);
  await assert.rejects(parse(SendSermonDto, { serviceId: SV_A, replace: 'sim' }), BadRequestException);
  await parse(SendSermonDto, { serviceId: SV_A, replace: true });
  await assert.rejects(parse(DeliveryPreviewQuery, { date: '2026-11-22' }, 'query'), BadRequestException);
  await parse(DeliveryPreviewQuery, { date: '2026-11-22', startTime: '19:00' }, 'query');
});

test('reenviar uma palavra antiga não toma o culto de quem já espera: 409 e o envio fica onde estava', async () => {
  const before = deliveryRow({ id: 'a', sermonId: S1, serviceId: null, pinned: false, date: d('2026-12-06'), startTime: '10:00', createdAt: new Date('2026-11-01T00:00:00Z') });
  const mk = () => build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: SERVICES(),
    deliveries: [
      { ...before },
      deliveryRow({ id: 'b', sermonId: S2, authorId: OTHER, serviceId: SV_B, pinned: false, date: d('2026-11-22'), startTime: '19:00', createdAt: new Date('2026-11-10T00:00:00Z') }),
    ],
  });
  const t = mk();
  await assert.rejects(t.service.send(user(), S1, { date: '2026-11-22', startTime: '19:00' }), (e: any) => e instanceof ConflictException && (e.getResponse() as any).code === 'SERVICE_HAS_SERMON');
  assert.equal(t.deliveries.find((x) => x.id === 'b')!.serviceId, SV_B);
  assert.deepEqual(t.deliveries.find((x) => x.id === 'a'), before);
});

test('409 no caminho da data desfaz a mudança de um envio que já existia', async () => {
  const before = deliveryRow({ id: 'a', sermonId: S1, serviceId: SV_A, pinned: true, date: d('2026-11-22'), startTime: '09:00' });
  const { service, deliveries } = build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: SERVICES(),
    deliveries: [
      { ...before },
      deliveryRow({ id: 'b', sermonId: S2, authorId: OTHER, serviceId: SV_B, pinned: true, date: d('2026-11-22'), startTime: '19:00' }),
    ],
  });
  await assert.rejects(service.send(user(), S1, { date: '2026-11-22', startTime: '19:30' }), ConflictException);
  assert.deepEqual(deliveries.find((x) => x.id === 'a'), before);
  assert.equal(deliveries.find((x) => x.id === 'b')!.serviceId, SV_B);
});

// ---- revisão final ----

const PAST = '2026-11-15'; // domingo passado: a palavra desse dia já foi pregada

test('apagar a palavra enviada devolve o culto à palavra guardada de outro pregador', async () => {
  const { sermonsService, deliveries } = build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: SERVICES(),
    deliveries: [
      deliveryRow({ id: 'mine', sermonId: S1, serviceId: SV_B, pinned: true, date: d('2026-11-22'), startTime: '19:00', createdAt: new Date('2026-11-01T00:00:00Z') }),
      deliveryRow({ id: 'g', sermonId: S2, authorId: OTHER, serviceId: null, pinned: false, date: d('2026-11-22'), startTime: '19:00', createdAt: new Date('2026-11-06T00:00:00Z') }),
    ],
  });
  await sermonsService.remove(user(), S1);
  assert.equal(deliveries.some((x) => x.id === 'mine'), false);
  assert.equal(deliveries.find((x) => x.id === 'g')!.serviceId, SV_B);
});

test('cancelar o envio de uma palavra já pregada dá 400 e o registro fica', async () => {
  const past = deliveryRow({ id: 'p', sermonId: S1, serviceId: null, pinned: false, date: d(PAST), startTime: '19:00' });
  const { service, deliveries, writes } = build({ sermons: [sermonRow(S1)], services: SERVICES(), deliveries: [{ ...past }] });
  await assert.rejects(service.cancel(user(), S1), (e: any) => e instanceof BadRequestException && e.message === 'Esta palavra já foi pregada.');
  assert.deepEqual(writes, []);
  assert.deepEqual(deliveries, [past]);
});

test('reenviar uma palavra já pregada dá 400 e o registro fica', async () => {
  const past = deliveryRow({ id: 'p', sermonId: S1, serviceId: null, pinned: false, date: d(PAST), startTime: '19:00' });
  const { service, deliveries, writes } = build({ sermons: [sermonRow(S1)], services: SERVICES(), deliveries: [{ ...past }] });
  for (const dto of [{ serviceId: SV_B }, { date: '2026-11-29', startTime: '19:00' }]) {
    await assert.rejects(
      service.send(user(), S1, dto),
      (e: any) => e instanceof BadRequestException && e.message === 'Esta palavra já foi pregada. Duplique a palavra para enviar de novo.',
    );
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(deliveries, [past]);
});

test('culto que já aconteceu não é destino, nem com replace: o envio passado de outro pregador fica', async () => {
  const SV_PAST = '33333333-3333-4333-8333-333333333360';
  const theirs = deliveryRow({ id: 'x', sermonId: S2, authorId: OTHER, serviceId: SV_PAST, pinned: true, date: d(PAST), startTime: '19:00' });
  const { service, deliveries, writes } = build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: [...SERVICES(), serviceRow(SV_PAST, PAST, '19:00')],
    deliveries: [{ ...theirs }],
  });
  for (const replace of [undefined, true]) {
    await assert.rejects(
      service.send(user(), S1, { serviceId: SV_PAST, replace }),
      (e: any) => e instanceof BadRequestException && e.message === 'Este culto já aconteceu.',
    );
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(deliveries, [theirs]);
});

test('replace pela data não apaga o envio de hoje que já passou', async () => {
  // Hoje (sexta 20/11) às 08:00 já passou: são 09:00 em Brasília.
  const SV_TODAY = '33333333-3333-4333-8333-333333333370';
  const theirs = deliveryRow({ id: 'x', sermonId: S2, authorId: OTHER, serviceId: SV_TODAY, pinned: true, date: d('2026-11-20'), startTime: '08:00' });
  const { service, deliveries } = build({
    sermons: [sermonRow(S1), sermonRow(S2, { authorId: OTHER })],
    services: [serviceRow(SV_TODAY, '2026-11-20', '08:00')],
    deliveries: [{ ...theirs }],
  });
  await assert.rejects(
    service.send(user(), S1, { date: '2026-11-20', startTime: '10:00', replace: true }),
    (e: any) => e instanceof BadRequestException && e.message === 'Este culto já aconteceu.',
  );
  assert.deepEqual(deliveries, [theirs]);
});

test('violação de unicidade em serviceId (envio simultâneo) vira 409 SERVICE_HAS_SERMON', async () => {
  const t = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  (t.service as any).prisma.sermonDelivery.create = async () => {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['service_id'] } });
  };
  await assert.rejects(t.service.send(user(), S1, { serviceId: SV_B }), (e: any) => {
    assert.ok(e instanceof ConflictException);
    assert.deepEqual(e.getResponse(), { code: 'SERVICE_HAS_SERMON', message: 'Este culto já tem uma palavra.' });
    return true;
  });
  // Outro erro do banco segue como está.
  (t.service as any).prisma.sermonDelivery.create = async () => {
    throw Object.assign(new Error('outro'), { code: 'P2003' });
  };
  await assert.rejects(t.service.send(user(), S1, { serviceId: SV_B }), (e: any) => e.code === 'P2003');
});

test('serviceOptions não lista o culto de hoje que já começou', async () => {
  const early = '33333333-3333-4333-8333-333333333380';
  const later = '33333333-3333-4333-8333-333333333381';
  const { service } = build({
    services: [...SERVICES(), serviceRow(early, '2026-11-20', '09:00'), serviceRow(later, '2026-11-20', '09:01')],
  });
  const out = await service.serviceOptions(user());
  assert.deepEqual(out.map((o) => o.id), [later, SV_A, SV_B]);
});

test('enviar para data e hora que já passaram dá 400', async () => {
  const { service, writes } = build({ sermons: [sermonRow(S1)], services: SERVICES() });
  for (const dto of [{ date: '2026-11-19', startTime: '19:00' }, { date: '2026-11-20', startTime: '09:00' }]) {
    await assert.rejects(service.send(user(), S1, dto), (e: any) => e instanceof BadRequestException && e.message === 'Escolha uma data futura.');
  }
  assert.deepEqual(writes, []);
  await service.send(user(), S1, { date: '2026-11-20', startTime: '09:01' });
});

// --- slides no envio ---------------------------------------------------------

const STORED = () =>
  buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS').map((x) => (x.id === 'pt2:0' ? { ...x, included: false } : x));
// Um PRIVATE marcado à força no banco também não pode sair.
const TAMPERED = () => STORED().map((x) => (x.kind === 'PRIVATE' ? { ...x, included: true } : x));

test('send copia os slides públicos atuais e o estilo para o envio, sem PRIVATE', async () => {
  const { service, deliveries } = build({
    sermons: [sermonRow(S1, { slides: TAMPERED(), slideStyle: 'BACKGROUND', slideMode: 'VERSES_AND_POINTS' })],
    services: SERVICES(),
  });
  await service.send(user(), S1, { serviceId: SV_B });
  assert.equal(deliveries[0].slideStyle, 'BACKGROUND');
  assert.deepEqual(deliveries[0].slides.map((x: Row) => x.kind), ['TITLE', 'VERSE', 'POINT', 'VERSE']);
  assert.equal(JSON.stringify(deliveries[0].slides).includes('Dois minutos'), false);
  for (const x of deliveries[0].slides) assert.deepEqual(Object.keys(x).sort(), ['kind', 'layout', 'reference', 'subtitle', 'text', 'title', 'verse']);
  assert.equal(deliveries[0].slides[1].reference, 'João 8:12 · BLIVRE');
});

test('reenviar (mover) recopia os slides atuais', async () => {
  const { service, deliveries, sermons } = build({
    sermons: [sermonRow(S1)],
    services: SERVICES(),
    deliveries: [deliveryRow({ sermonId: S1, serviceId: SV_A, pinned: true, date: d('2026-11-22'), startTime: '09:00', slides: [] })],
  });
  sermons[0].slides = STORED();
  await service.send(user(), S1, { serviceId: SV_B });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].slides.length, 4);
});

test('summaries conta os slides do envio', async () => {
  const { service } = build({
    services: SERVICES(),
    deliveries: [deliveryRow({ serviceId: SV_B, sermonId: S1, slides: [{ kind: 'VERSE', text: 'a', reference: 'b' }, { kind: 'TITLE', text: 'c', reference: null }] })],
  });
  assert.equal((await service.summaries(TENANT, [SV_B])).get(SV_B)!.slideCount, 2);
});

test('slidesForService lê só o envio do tenant (linha antiga completada com slideFace); mySermonId só para o autor', async () => {
  const slides = [
    { kind: 'VERSE', text: 'Eu sou a luz', reference: 'João 8:12' },
    { kind: 'PRIVATE', text: 'segredo', reference: null },
    { kind: 'POINT', text: 'A luz chama', reference: null, sourceBlockId: 'pt1', edited: true },
  ];
  const { service, writes } = build({
    services: SERVICES(),
    deliveries: [deliveryRow({ serviceId: SV_B, sermonId: S1, title: 'Luz', preacherName: 'Paulo', slideStyle: 'BACKGROUND', slides })],
  });
  const mine = await service.slidesForService(TENANT, SV_B, AUTHOR);
  assert.deepEqual(mine, {
    title: 'Luz',
    preacherName: 'Paulo',
    slideStyle: 'BACKGROUND',
    slides: [
      { kind: 'VERSE', text: 'Eu sou a luz', layout: 'M03', title: 'João 8:12', subtitle: null, verse: 'Eu sou a luz', reference: 'João 8:12' },
      { kind: 'POINT', text: 'A luz chama', layout: 'M01', title: 'A luz chama', subtitle: null, verse: null, reference: null },
    ],
    mySermonId: S1,
  });
  assert.equal((await service.slidesForService(TENANT, SV_B, OTHER))!.mySermonId, null);
  assert.equal(await service.slidesForService(OTHER_TENANT, SV_B, AUTHOR), null);
  assert.equal(await service.slidesForService(TENANT, SV_A, AUTHOR), null);
  assert.deepEqual(writes, []);
});
