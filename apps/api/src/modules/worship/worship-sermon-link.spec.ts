import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthUser } from '../auth/auth-user';
import { SermonDeliveryService } from '../sermons/sermon-delivery.service';
import { SermonsService } from '../sermons/sermons.service';
import { WorshipServicesService } from './worship-services.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTHOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S1 = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-20T12:00:00.000Z');
const me = { userId: AUTHOR, tenantId: TENANT, email: 'p@x.com', role: 'MEMBER' } as unknown as AuthUser;

type Row = Record<string, any>;

/** Prisma em memória só com o que a ligação usa: cultos, palavras e envios (serviceId único). */
function build() {
  const sermons: Row[] = [{
    id: S1, tenantId: TENANT, authorId: AUTHOR, title: 'Graça', document: {}, revision: 1, baseReference: null,
    pointCount: 0, verseRefs: '', estimatedSeconds: 601, slideMode: null, slideStyle: 'MINIMAL', slides: [],
    slidesRevision: null, createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-10T00:00:00Z'),
  }];
  const services: Row[] = [];
  const deliveries: Row[] = [];
  let seq = 0;
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v instanceof Date) return row[k]?.getTime() === v.getTime();
      if (v && typeof v === 'object') return 'in' in v ? v.in.includes(row[k]) : true;
      return row[k] === v;
    });
  const unique = () => {
    for (const key of ['sermonId', 'serviceId']) {
      const seen = new Set<string>();
      for (const x of deliveries) {
        if (x[key] == null) continue;
        if (seen.has(x[key])) throw new Error(`unique violation ${key}`);
        seen.add(x[key]);
      }
    }
  };
  const full = (s: Row) => ({ ...s, moments: [], songs: [] });
  const prisma: Row = {
    adminUser: { findFirst: async () => ({ name: 'Pastor Paulo' }) },
    sermon: {
      findFirst: async ({ where }: Row) => {
        const s = sermons.find((r) => matches(r, where));
        if (!s) return null;
        const dl = deliveries.find((x) => x.sermonId === s.id);
        return { ...s, delivery: dl ? { ...dl, service: services.find((v) => v.id === dl.serviceId) ?? null } : null };
      },
    },
    worshipService: {
      findFirst: async ({ where }: Row) => {
        const s = services.find((r) => matches(r, where));
        return s ? full(s) : null;
      },
      findMany: async ({ where }: Row) =>
        services
          .filter((s) => matches(s, where))
          .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
          .map((s) => ({ ...s, _count: { songs: 0 } })),
      create: async ({ data }: Row) => {
        const { moments: _m, ...rest } = data;
        const row = { id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(++seq).padStart(12, '0')}`, updatedAt: new Date(), ...rest };
        services.push(row);
        return full(row);
      },
      update: async ({ where, data }: Row) => {
        const row = services.find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return full(row);
      },
      delete: async ({ where }: Row) => {
        services.splice(services.findIndex((s) => s.id === where.id), 1);
        // como o banco: o envio ligado ao culto só pode ficar com serviceId nulo (SetNull)
        deliveries.filter((x) => x.serviceId === where.id).forEach((x) => (x.serviceId = null));
      },
    },
    sermonDelivery: {
      findFirst: async ({ where }: Row) => deliveries.find((x) => matches(x, where)) ?? null,
      findMany: async ({ where }: Row) => deliveries.filter((x) => matches(x, where)).map((x) => ({ ...x })),
      create: async ({ data }: Row) => {
        const row = { id: `eeeeeeee-eeee-4eee-8eee-${String(++seq).padStart(12, '0')}`, createdAt: new Date(), ...data };
        deliveries.push(row);
        unique();
        return row;
      },
      update: async ({ where, data }: Row) => {
        const row = deliveries.find((x) => x.id === where.id)!;
        Object.assign(row, data);
        unique();
        return row;
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = deliveries.filter((x) => matches(x, where));
        rows.forEach((r) => Object.assign(r, data));
        unique();
        return { count: rows.length };
      },
      delete: async ({ where }: Row) => {
        deliveries.splice(deliveries.findIndex((x) => x.id === where.id), 1);
      },
    },
    $transaction: async (fn: (tx: Row) => unknown) => fn(prisma),
  };
  const sermonsService = new SermonsService(prisma as never);
  sermonsService.clock = () => NOW;
  const delivery = new SermonDeliveryService(prisma as never, sermonsService);
  const worship = new WorshipServicesService(prisma as never, delivery);
  return { delivery, worship, deliveries, services };
}

test('envio para outra data espera; criar o culto o pega; apagar o culto o devolve', async () => {
  const { delivery, worship, deliveries } = build();
  await delivery.send(me, S1, { date: '2026-12-06', startTime: '19:00' });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].serviceId, null);

  const created = await worship.create(TENANT, { date: '2026-12-06', startTime: '19:00' });
  assert.equal(deliveries[0].serviceId, created.id);
  assert.deepEqual(created.sermon, { title: 'Graça', preacherName: 'Pastor Paulo', estimatedMinutes: 11, slideCount: 0 });
  const preview = await worship.sermonSlides(TENANT, created.id, AUTHOR);
  assert.deepEqual(preview, { title: 'Graça', preacherName: 'Pastor Paulo', slideStyle: 'MINIMAL', slides: [], mySermonId: S1 });
  assert.equal((await worship.list(TENANT)).items[0].hasSermon, true);

  await worship.remove(TENANT, created.id);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].serviceId, null);
  assert.equal(deliveries[0].pinned, false);
});
