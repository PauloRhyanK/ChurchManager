import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import type { AuthUser } from '../auth/auth-user';
import { DeliveryPreviewQuery, SendSermonDto } from './dto/delivery.dto';
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
  createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-10T00:00:00Z'), ...over,
});
const serviceRow = (id: string, date: string, startTime: string, over: Row = {}): Row => ({
  id, tenantId: TENANT, date: d(date), startTime, name: `Culto ${startTime}`, ...over,
});
let seq = 0;
const deliveryRow = (over: Row): Row => ({
  id: `eeeeeeee-eeee-4eee-8eee-${String(++seq).padStart(12, '0')}`,
  tenantId: TENANT, sermonId: null, authorId: AUTHOR, serviceId: null, pinned: false,
  title: 'T', preacherName: 'Pr', estimatedSeconds: 60, createdAt: new Date('2026-11-05T00:00:00Z'), ...over,
});

function build(init: { sermons?: Row[]; services?: Row[]; deliveries?: Row[] }) {
  const sermons = (init.sermons ?? []).map((s) => ({ ...s }));
  const services = (init.services ?? []).map((s) => ({ ...s }));
  const deliveries = (init.deliveries ?? []).map((x) => ({ ...x }));
  const writes: string[] = [];
  const snapshot = () => JSON.stringify(deliveries);
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('gte' in v) return row[k] >= v.gte;
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

test('summaries devolve só título, pregador e minutos (arredondados para cima)', async () => {
  const { service } = build({
    services: SERVICES(),
    deliveries: [deliveryRow({ serviceId: SV_B, title: 'Luz', preacherName: 'Paulo', estimatedSeconds: 601, sermonId: S1 })],
  });
  const map = await service.summaries(TENANT, [SV_A, SV_B]);
  assert.deepEqual([...map.keys()], [SV_B]);
  assert.deepEqual(map.get(SV_B), { title: 'Luz', preacherName: 'Paulo', estimatedMinutes: 11 });
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
