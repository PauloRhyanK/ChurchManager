import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { EXAMPLE_DOC } from './sermon-example';
import { SermonsService } from './sermons.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTHOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-11-20T12:00:00.000Z');

const user = (over: Partial<AuthUser> = {}) =>
  ({ userId: AUTHOR, tenantId: TENANT, role: 'MEMBER', ...over }) as AuthUser;

type Row = Record<string, any>;

function sermonRow(over: Row = {}): Row {
  return {
    id: over.id ?? '11111111-1111-4111-8111-111111111111',
    tenantId: TENANT,
    authorId: AUTHOR,
    title: 'Sem título',
    document: { type: 'doc', content: [] },
    revision: 4,
    baseReference: null,
    pointCount: 0,
    verseRefs: '',
    estimatedSeconds: 0,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-10T00:00:00Z'),
    delivery: null,
    ...over,
  };
}
const delivery = (date: string, over: Row = {}): Row => ({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  date: new Date(`${date}T00:00:00.000Z`),
  startTime: '19:00',
  serviceId: null,
  service: null,
  ...over,
});

function build(initial: Row[]) {
  const sermons = initial.map((s) => ({ ...s }));
  const writes: string[] = [];
  const calls: { op: string; args: Row }[] = [];
  const match = (s: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => (typeof v === 'object' && v !== null ? true : s[k] === v));
  const prisma: Row = {
    sermon: {
      findMany: async (args: Row) => {
        calls.push({ op: 'sermon.findMany', args });
        return sermons
          .filter((s) => match(s, args.where))
          .map((s) => {
            const copy = { ...s };
            if (args.omit?.document) delete copy.document;
            return copy;
          })
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      },
      findFirst: async ({ where }: Row) => sermons.find((s) => match(s, where)) ?? null,
      create: async ({ data }: Row) => {
        writes.push('sermon.create');
        const row = sermonRow({ id: '99999999-9999-4999-8999-999999999999', revision: 0, ...data });
        sermons.push(row);
        return row;
      },
      updateMany: async ({ where, data }: Row) => {
        calls.push({ op: 'sermon.updateMany', args: { where, data } });
        const target = sermons.find((s) => match(s, where) && (where.revision === undefined || s.revision === where.revision));
        if (!target) return { count: 0 };
        writes.push('sermon.update');
        for (const [k, v] of Object.entries(data)) {
          target[k] = typeof v === 'object' && v !== null && 'increment' in (v as Row) ? target[k] + (v as Row).increment : v;
        }
        return { count: 1 };
      },
      deleteMany: async ({ where }: Row) => {
        calls.push({ op: 'sermon.deleteMany', args: { where } });
        const i = sermons.findIndex((s) => match(s, where));
        if (i < 0) return { count: 0 };
        writes.push('sermon.delete');
        sermons.splice(i, 1);
        return { count: 1 };
      },
    },
    // O rematch depois de apagar: sem cultos nem envios no dia, não escreve nada.
    worshipService: { findMany: async () => [] },
    sermonDelivery: {
      findMany: async () => [],
      update: async ({ where, data }: Row) => {
        writes.push('delivery.update');
        calls.push({ op: 'delivery.update', args: { where, data } });
      },
      delete: async ({ where }: Row) => {
        writes.push('delivery.delete');
        calls.push({ op: 'delivery.delete', args: { where } });
      },
    },
    $transaction: async (fn: (tx: Row) => unknown) => fn(prisma),
  };
  const service = new SermonsService(prisma as never);
  service.clock = () => NOW;
  return { service, sermons, writes, calls };
}

const VERSE_DOC = EXAMPLE_DOC as unknown;

test('list só devolve as palavras do autor e nunca pede o documento', async () => {
  const { service, calls } = build([
    sermonRow({ id: 'a1', title: 'Minha' }),
    sermonRow({ id: 'a2', authorId: OTHER, title: 'De outro' }),
    sermonRow({ id: 'a3', tenantId: OTHER_TENANT, title: 'Outro tenant' }),
  ]);
  const out = await service.list(user({ role: 'TENANT_ADMIN' }), {});
  assert.deepEqual(out.items.map((i) => i.title), ['Minha']);
  assert.equal(calls[0].args.omit.document, true);
  assert.equal('document' in out.items[0], false);
  assert.deepEqual(calls[0].args.where, { tenantId: TENANT, authorId: AUTHOR });
});

test('list: situação, contagens antes do filtro de situação e ordem por atualização', async () => {
  const { service } = build([
    sermonRow({ id: 'd', title: 'Rascunho', updatedAt: new Date('2026-11-12T00:00:00Z') }),
    sermonRow({ id: 's', title: 'Enviada', updatedAt: new Date('2026-11-11T00:00:00Z'), delivery: delivery('2026-11-22') }),
    sermonRow({ id: 'p', title: 'Pregada', updatedAt: new Date('2026-11-10T00:00:00Z'), delivery: delivery('2026-11-15') }),
  ]);
  const all = await service.list(user(), {});
  assert.deepEqual(all.items.map((i) => i.status), ['DRAFT', 'SENT', 'PREACHED']);
  assert.deepEqual(all.counts, { all: 3, draft: 1, sent: 1, preached: 1 });
  const sent = await service.list(user(), { status: 'SENT' });
  assert.deepEqual(sent.items.map((i) => i.id), ['s']);
  assert.deepEqual(sent.counts, { all: 3, draft: 1, sent: 1, preached: 1 });
  assert.deepEqual(sent.items[0].delivery, { date: '2026-11-22', startTime: '19:00', serviceId: null, serviceName: null });
});

test('busca "joao" acha "João 8:12" nos versículos e o título "João e a luz"', async () => {
  const { service } = build([
    sermonRow({ id: 'v', title: 'Luz do mundo', verseRefs: 'joao 8:12' }),
    sermonRow({ id: 't', title: 'João e a luz' }),
    sermonRow({ id: 'n', title: 'Outra', verseRefs: 'salmos 23:1' }),
  ]);
  const out = await service.list(user(), { q: 'joao' });
  assert.deepEqual(out.items.map((i) => i.id).sort(), ['t', 'v']);
  assert.equal(out.counts.all, 2);
  assert.equal((await service.list(user(), { q: 'João' })).items.length, 2);
});

test('create grava tenant e autor do usuário, título padrão e documento vazio', async () => {
  const { service, sermons } = build([]);
  const created = await service.create(user(), {});
  assert.equal(created.title, 'Sem título');
  assert.equal(created.status, 'DRAFT');
  assert.equal(sermons[0].tenantId, TENANT);
  assert.equal(sermons[0].authorId, AUTHOR);
  assert.equal((await service.create(user(), { title: 'Luz' })).title, 'Luz');
});

test('outro usuário (mesmo administrador) e outro tenant recebem 404 e nada é escrito', async () => {
  const { service, writes } = build([sermonRow({ id: '11111111-1111-4111-8111-111111111111' })]);
  const id = '11111111-1111-4111-8111-111111111111';
  const intruders = [
    user({ userId: OTHER, role: 'TENANT_ADMIN' }),
    user({ userId: OTHER, role: 'PLATFORM_ADMIN' as never }),
    user({ tenantId: OTHER_TENANT }),
  ];
  for (const intruder of intruders) {
    await assert.rejects(service.get(intruder, id), NotFoundException);
    await assert.rejects(service.update(intruder, id, { title: 'x' }), NotFoundException);
    await assert.rejects(service.update(intruder, id, { document: VERSE_DOC as never }), NotFoundException);
    await assert.rejects(service.duplicate(intruder, id), NotFoundException);
    await assert.rejects(service.remove(intruder, id), NotFoundException);
  }
  assert.deepEqual(writes, []);
});

test('update com documento grava derivados e soma 1 à revisão', async () => {
  const { service, sermons } = build([sermonRow({ revision: 4 })]);
  const out = await service.update(user(), sermons[0].id, { document: VERSE_DOC as never, baseRevision: 4 });
  assert.equal(out.revision, 5);
  assert.equal(sermons[0].baseReference, 'João 8:12');
  assert.equal(sermons[0].pointCount > 0, true);
  assert.match(sermons[0].verseRefs, /joao 8:12/);
  assert.equal(sermons[0].estimatedSeconds > 0, true);
  assert.equal(out.baseReference, 'João 8:12');
});

test('update sem baseRevision grava; só título não mexe na revisão', async () => {
  const { service, sermons } = build([sermonRow({ revision: 4 })]);
  const titled = await service.update(user(), sermons[0].id, { title: 'Nova' });
  assert.equal(titled.revision, 4);
  assert.equal(titled.title, 'Nova');
  assert.equal((await service.update(user(), sermons[0].id, { document: VERSE_DOC as never })).revision, 5);
});

test('baseRevision errado dá 409 e nada é escrito', async () => {
  const { service, sermons, writes } = build([sermonRow({ revision: 4 })]);
  await assert.rejects(service.update(user(), sermons[0].id, { document: VERSE_DOC as never, baseRevision: 3 }), ConflictException);
  assert.deepEqual(writes, []);
  assert.equal(sermons[0].revision, 4);
});

test('documento inválido dá 400 e nada é escrito', async () => {
  const { service, sermons, writes } = build([sermonRow()]);
  await assert.rejects(service.update(user(), sermons[0].id, { document: { type: 'nope' } }), BadRequestException);
  assert.deepEqual(writes, []);
});

test('salvar palavra Enviada atualiza o envio; Pregada não', async () => {
  const sent = build([sermonRow({ delivery: delivery('2026-11-22') })]);
  await sent.service.update(user(), sent.sermons[0].id, { title: 'Nova', document: VERSE_DOC as never });
  const upd = sent.calls.find((c) => c.op === 'delivery.update');
  assert.equal(upd?.args.data.title, 'Nova');
  assert.equal(upd?.args.data.estimatedSeconds > 0, true);

  const preached = build([sermonRow({ delivery: delivery('2026-11-15') })]);
  await preached.service.update(user(), preached.sermons[0].id, { title: 'Nova', document: VERSE_DOC as never });
  assert.equal(preached.writes.includes('delivery.update'), false);
});

test('apagar Enviada apaga o envio; Pregada mantém o envio', async () => {
  const sent = build([sermonRow({ delivery: delivery('2026-11-22') })]);
  await sent.service.remove(user(), sent.sermons[0].id);
  assert.deepEqual(sent.writes, ['delivery.delete', 'sermon.delete']);

  const preached = build([sermonRow({ delivery: delivery('2026-11-15') })]);
  assert.deepEqual(await preached.service.remove(user(), preached.sermons[0].id), { success: true });
  assert.deepEqual(preached.writes, ['sermon.delete']);
});

test('duplicate cria "<título> (cópia)", sem envio, revisão 0, do mesmo autor', async () => {
  const { service, sermons } = build([
    sermonRow({ title: 'Luz', document: EXAMPLE_DOC, pointCount: 2, delivery: delivery('2026-11-22') }),
  ]);
  const copy = await service.duplicate(user(), sermons[0].id);
  assert.equal(copy.title, 'Luz (cópia)');
  assert.equal(copy.status, 'DRAFT');
  assert.equal(copy.delivery, null);
  assert.equal(copy.revision, 0);
  assert.equal(sermons[1].authorId, AUTHOR);
  assert.equal(sermons[1].pointCount, 2);
});

test('as escritas filtram por id, tenant e autor de quem chama', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const { service, calls } = build([sermonRow({ id })]);
  await service.update(user(), id, { title: 'Nova', document: VERSE_DOC as never });
  await service.remove(user(), id);
  const owner = { id, tenantId: TENANT, authorId: AUTHOR };
  const upd = calls.find((c) => c.op === 'sermon.updateMany')!;
  assert.deepEqual({ id: upd.args.where.id, tenantId: upd.args.where.tenantId, authorId: upd.args.where.authorId }, owner);
  assert.deepEqual(calls.find((c) => c.op === 'sermon.deleteMany')!.args.where, owner);
});
