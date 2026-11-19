import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import type { AuthUser } from '../auth/auth-user';
import { GenerateSlidesDto, SaveSlidesDto } from './dto/slides.dto';
import { EXAMPLE_DOC } from './sermon-example';
import { readDeliverySlides } from './delivery-copy';
import { buildSlides, type SlideItem } from './sermon-slides';
import { SermonSlidesService, normalizeListReference } from './sermon-slides.service';
import { SermonsService } from './sermons.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTHOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const S1 = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-20T12:00:00.000Z'); // sexta 09:00 em Brasília

const user = (over: Partial<AuthUser> = {}) =>
  ({ userId: AUTHOR, tenantId: TENANT, email: 'p@x.com', role: 'MEMBER', ...over }) as AuthUser;

type Row = Record<string, any>;

const sermonRow = (over: Row = {}): Row => ({
  id: S1, tenantId: TENANT, authorId: AUTHOR, title: 'Luz', document: EXAMPLE_DOC, revision: 3,
  baseReference: null, pointCount: 0, verseRefs: '', estimatedSeconds: 601,
  slideMode: null, slideStyle: 'MINIMAL', slides: [], slidesRevision: null,
  createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-10T00:00:00Z'), ...over,
});
const deliveryRow = (date: string, over: Row = {}): Row => ({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', tenantId: TENANT, sermonId: S1, authorId: AUTHOR,
  date: new Date(`${date}T00:00:00.000Z`), startTime: '19:00', serviceId: null, pinned: false,
  title: 'Luz', preacherName: 'Pr', estimatedSeconds: 601, slideStyle: 'MINIMAL', slides: [], ...over,
});

function build(init: { sermons: Row[]; deliveries?: Row[] }) {
  const sermons = init.sermons.map((s) => ({ ...s }));
  const deliveries = (init.deliveries ?? []).map((x) => ({ ...x }));
  const writes: string[] = [];
  const updates: Row[] = [];
  const match = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => (typeof v === 'object' && v !== null ? true : row[k] === v));
  const prisma: Row = {
    sermon: {
      findMany: async ({ where }: Row) =>
        structuredClone(
          sermons
            .filter((r) => match(r, where))
            .map((s) => {
              const dl = deliveries.find((x) => x.sermonId === s.id);
              return { ...s, delivery: dl ? { ...dl, service: null } : null };
            }),
        ),
      findFirst: async ({ where }: Row) => {
        const s = sermons.find((r) => match(r, where));
        if (!s) return null;
        const dl = deliveries.find((x) => x.sermonId === s.id);
        return structuredClone({ ...s, delivery: dl ? { ...dl, service: null } : null });
      },
      updateMany: async ({ where, data }: Row) => {
        updates.push({ where, data });
        const target = sermons.find((s) => match(s, where) && (where.revision === undefined || s.revision === where.revision));
        if (!target) return { count: 0 };
        writes.push('sermon.update');
        for (const [k, v] of Object.entries(data)) {
          target[k] = typeof v === 'object' && v !== null && 'increment' in (v as Row) ? target[k] + (v as Row).increment : structuredClone(v);
        }
        return { count: 1 };
      },
    },
    sermonDelivery: {
      update: async ({ where, data }: Row) => {
        writes.push('delivery.update');
        const row = deliveries.find((x) => x.id === where.id)!;
        Object.assign(row, structuredClone(data));
        return row;
      },
    },
    worshipService: { findMany: async () => [] },
    $transaction: async (fn: (tx: Row) => unknown) => fn(prisma),
  };
  const sermonsService = new SermonsService(prisma as never);
  sermonsService.clock = () => NOW;
  const service = new SermonSlidesService(prisma as never, sermonsService);
  return { service, sermonsService, sermons, deliveries, writes, updates };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const asInput = (items: SlideItem[]) => items.map((s) => ({ id: s.id, included: s.included }));
const WITH_VERSES = ['v1:0', 'overview', 'v2:0', 'pt2:title', 'n1:0'];

test('generate em palavra sem slides grava a sequência, o modo, o estilo e slidesRevision', async () => {
  const { service, sermons } = build({ sermons: [sermonRow()] });
  const out = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS', style: 'BACKGROUND' });
  assert.deepEqual(ids(out.slides), WITH_VERSES);
  assert.equal(out.slideMode, 'VERSES_AND_POINTS');
  assert.equal(out.slideStyle, 'BACKGROUND');
  assert.equal(out.slidesStale, false);
  assert.equal(sermons[0].slidesRevision, 3);
  assert.equal(sermons[0].revision, 3, 'gerar não mexe na revisão do documento');
  assert.equal(out.slideCount, 4);
});

test('"Só títulos": capa, visão geral e um slide por ponto; modo TITLES gravado', async () => {
  const { service, sermons } = build({ sermons: [sermonRow()] });
  const out = await service.generate(user(), S1, { mode: 'TITLES' });
  assert.deepEqual(ids(out.slides), ['title', 'overview', 'pt1:title', 'pt2:title', 'n1:0']);
  assert.equal(sermons[0].slideMode, 'TITLES');
  assert.equal(out.slideMode, 'TITLES');
});

test('generate completa as referências entre parênteses nas listas', async () => {
  const document = {
    type: 'doc',
    content: [
      { type: 'point', attrs: { id: 'p' }, content: [{ type: 'text', text: 'Troca de guarda' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'José (Gn 37:5) e (nada)' }] }] }] },
    ],
  };
  const { service } = build({ sermons: [sermonRow({ document })] });
  const out = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  assert.deepEqual(out.slides.find((s) => s.layout === 'BULLETS')!.items, ['José (Gênesis 37:5) e (nada)']);
});

test('normalizeListReference: livro por extenso; "l" no lugar de "1"; nulo sem capítulo', () => {
  assert.equal(normalizeListReference('Gn 37:5'), 'Gênesis 37:5');
  assert.equal(normalizeListReference('Ex 3:2'), 'Êxodo 3:2');
  assert.equal(normalizeListReference('l Reis 3.5'), '1 Reis 3:5');
  assert.equal(normalizeListReference('1 Co 2:13'), '1 Coríntios 2:13');
  for (const not of ['Ex', 'nada', 'pede-me...', '2026']) assert.equal(normalizeListReference(not), null, not);
});

test('gerar de novo no mesmo modo preserva item desmarcado e texto editado; trocar de modo recomeça', async () => {
  const { service } = build({ sermons: [sermonRow()] });
  const first = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const items = first.slides.map((s) => ({
    id: s.id,
    included: s.id === 'v2:0' ? false : s.included,
    ...(s.id === 'pt2:title' ? { text: 'A luz nos mostra' } : {}),
  }));
  await service.save(user(), S1, { items });
  const again = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  assert.equal(again.slides.find((s) => s.id === 'v2:0')!.included, false);
  const pt = again.slides.find((s) => s.id === 'pt2:title')!;
  assert.deepEqual([pt.text, pt.edited], ['A luz nos mostra', true]);

  const other = await service.generate(user(), S1, { mode: 'TITLES' });
  assert.deepEqual(other.slides, buildSlides('Luz', EXAMPLE_DOC, 'TITLES'));
  assert.equal(other.slideMode, 'TITLES');
});

test('slides gravados num modo antigo (VERSES, FULL) valem como "Com versículos" e passam pelo merge', async () => {
  const stored = buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS').map((s) => (s.id === 'v2:0' ? { ...s, included: false } : s));
  for (const slideMode of ['VERSES', 'FULL']) {
    const { service, sermonsService } = build({ sermons: [sermonRow({ slides: stored, slideMode })] });
    assert.equal((await sermonsService.get(user(), S1)).slideMode, 'VERSES_AND_POINTS');
    const again = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
    assert.equal(again.slides.find((s) => s.id === 'v2:0')!.included, false, slideMode);
  }
});

test('save grava a nova ordem; PRIVATE marcado fica false e no fim; não mexe nas revisões', async () => {
  const { service, sermons } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const reordered = [...gen.slides].reverse().map((s) => ({ id: s.id, included: true }));
  const out = await service.save(user(), S1, { style: 'BACKGROUND', items: reordered });
  assert.deepEqual(ids(out.slides), ['pt2:title', 'v2:0', 'overview', 'v1:0', 'n1:0']);
  const priv = out.slides.find((s) => s.kind === 'PRIVATE')!;
  assert.equal(priv.included, false);
  assert.equal(out.slideStyle, 'BACKGROUND');
  assert.equal(sermons[0].revision, 3);
  assert.equal(sermons[0].slidesRevision, 3);
  assert.equal(out.slideCount, 4);
});

test('save com id desconhecido, repetido ou faltando dá 400 sem escrita', async () => {
  const { service, writes } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  writes.length = 0;
  const base = asInput(gen.slides);
  const bad = [
    [...base.slice(1), { id: 'zz:0', included: true }],
    [...base, { ...base[0] }],
    base.slice(1),
  ];
  for (const items of bad) {
    await assert.rejects(
      service.save(user(), S1, { items }),
      (e: any) => e instanceof BadRequestException && e.message === 'A lista de slides está desatualizada. Atualize a página.',
    );
  }
  assert.deepEqual(writes, []);
});

test('text só vale em TITLE e POINT: aparado marca edited; VERSE, SUMMARY e PRIVATE ignoram; 121 caracteres dá 400', async () => {
  const { service, writes } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'TITLES' });
  const items = gen.slides.map((s) => ({
    id: s.id,
    included: s.included,
    ...(s.kind === 'SUMMARY' || s.kind === 'PRIVATE' ? { text: 'trocado' } : {}),
    ...(s.id === 'pt1:title' ? { text: '  1. Novo ponto  ' } : {}),
    ...(s.id === 'title' ? { text: s.text } : {}),
  }));
  const out = await service.save(user(), S1, { items });
  for (const s of out.slides.filter((x) => x.kind === 'SUMMARY' || x.kind === 'PRIVATE')) assert.notEqual(s.text, 'trocado');
  const pt = out.slides.find((s) => s.id === 'pt1:title')!;
  assert.deepEqual([pt.text, pt.edited], ['1. Novo ponto', true]);
  assert.equal(out.slides.find((s) => s.id === 'title')!.edited, false, 'texto igual ao gravado não marca edited');

  const verses = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const v = await service.save(user(), S1, { items: verses.slides.map((s) => ({ id: s.id, included: true, ...(s.kind === 'VERSE' ? { text: 'trocado' } : {}) })) });
  for (const s of v.slides.filter((x) => x.kind === 'VERSE')) assert.notEqual(s.text, 'trocado');

  writes.length = 0;
  for (const size of [121, 300]) {
    const long = verses.slides.map((s) => ({ id: s.id, included: true, ...(s.id === 'pt2:title' ? { text: 'x'.repeat(size) } : {}) }));
    await assert.rejects(
      service.save(user(), S1, { items: long }),
      (e: any) => e instanceof BadRequestException && e.message === 'O título do slide passa de 120 caracteres.',
    );
  }
  const ok = verses.slides.map((s) => ({ id: s.id, included: true, ...(s.id === 'pt2:title' ? { text: 'x'.repeat(120) } : {}) }));
  assert.equal((await service.save(user(), S1, { items: ok })).slides.find((s) => s.id === 'pt2:title')!.text.length, 120);
});

test('palavra de outro autor (inclusive administrador) e de outro tenant: 404 sem escrita', async () => {
  const stored = buildSlides('Luz', EXAMPLE_DOC, 'TITLES');
  const { service, writes } = build({ sermons: [sermonRow({ slides: stored, slideMode: 'TITLES' })] });
  const intruders = [
    user({ userId: OTHER, role: 'TENANT_ADMIN' as never }),
    user({ userId: OTHER, role: 'PLATFORM_ADMIN' as never }),
    user({ tenantId: OTHER_TENANT }),
  ];
  const items = asInput(stored);
  for (const intruder of intruders) {
    await assert.rejects(service.generate(intruder, S1, { mode: 'TITLES' }), NotFoundException);
    await assert.rejects(service.save(intruder, S1, { items }), NotFoundException);
  }
  assert.deepEqual(writes, []);
});

test('as escritas filtram por id, tenant e autor', async () => {
  const { service, updates } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'TITLES' });
  await service.save(user(), S1, { items: asInput(gen.slides) });
  assert.equal(updates.length, 2);
  for (const u of updates) {
    assert.deepEqual({ id: u.where.id, tenantId: u.where.tenantId, authorId: u.where.authorId }, { id: S1, tenantId: TENANT, authorId: AUTHOR });
  }
});

test('slidesStale vira true depois de salvar o documento e false depois de generate; autosave não mexe nos slides', async () => {
  const { service, sermonsService, sermons } = build({ sermons: [sermonRow()] });
  await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const before = structuredClone(sermons[0].slides);
  const saved = await sermonsService.update(user(), S1, { document: EXAMPLE_DOC as never, baseRevision: 3 });
  assert.equal(saved.slidesStale, true);
  assert.deepEqual(sermons[0].slides, before);
  assert.equal((await sermonsService.get(user(), S1)).slidesStale, true);
  assert.equal((await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' })).slidesStale, false);
  sermons[0].revision = 9;
  sermons[0].slides = [];
  assert.equal((await sermonsService.get(user(), S1)).slidesStale, false, 'sem slides não é desatualizado');
});

test('palavra Enviada: save atualiza slides e estilo do envio, sem nenhum PRIVATE; Pregada: o envio não muda', async () => {
  const sent = build({ sermons: [sermonRow()], deliveries: [deliveryRow('2026-11-22')] });
  const gen = await sent.service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  await sent.service.save(user(), S1, {
    style: 'BACKGROUND',
    items: gen.slides.map((s) => ({ id: s.id, included: true })),
  });
  const copy = sent.deliveries[0];
  assert.equal(copy.slideStyle, 'BACKGROUND');
  assert.equal(copy.slides.length, 4);
  assert.equal(copy.slides.some((s: Row) => s.kind === 'PRIVATE'), false);
  assert.equal(JSON.stringify(copy.slides).includes('Dois minutos'), false, 'o texto da nota privada não sai');
  for (const s of copy.slides) assert.deepEqual(Object.keys(s).sort(), ['items', 'kind', 'layout', 'reference', 'start', 'text', 'title', 'verse']);

  const original = deliveryRow('2026-11-15');
  const preached = build({ sermons: [sermonRow()], deliveries: [original] });
  await preached.service.generate(user(), S1, { mode: 'TITLES' });
  const g2 = await preached.sermonsService.get(user(), S1);
  await preached.service.save(user(), S1, { style: 'BACKGROUND', items: asInput(g2.slides) });
  await preached.sermonsService.update(user(), S1, { title: 'Outro título' });
  assert.deepEqual(preached.deliveries[0], original);
  assert.equal(preached.writes.includes('delivery.update'), false);
});

test('cópia do envio: kind, text e reference do contrato; SUMMARY com os itens em text; lida de volta igual', async () => {
  const { service, deliveries } = build({ sermons: [sermonRow()], deliveries: [deliveryRow('2026-11-22')] });
  await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const copy = deliveries[0].slides as Row[];
  assert.deepEqual(copy[0], {
    kind: 'VERSE',
    text: 'Eu sou a luz do mundo; quem me segue não andará em trevas.',
    layout: 'VERSE',
    title: 'Luz',
    verse: 'Eu sou a luz do mundo; quem me segue não andará em trevas.',
    reference: 'João 8:12',
    items: null,
    start: null,
  });
  assert.deepEqual(copy[1], {
    kind: 'SUMMARY', text: 'A luz chama\nA luz mostra', layout: 'NUMBERED', title: 'Luz', verse: null, reference: null, items: ['A luz chama', 'A luz mostra'], start: 1,
  });
  assert.deepEqual(copy[3], { kind: 'POINT', text: '2. A luz mostra', layout: 'TITLE', title: '2. A luz mostra', verse: null, reference: null, items: null, start: null });
  assert.deepEqual(readDeliverySlides(copy), copy);
});

test('salvar título de palavra Enviada copia título, tempo e slides públicos para o envio', async () => {
  const { service, sermonsService, deliveries } = build({ sermons: [sermonRow()], deliveries: [deliveryRow('2026-11-22')] });
  await service.generate(user(), S1, { mode: 'TITLES' });
  deliveries[0].slides = [];
  await sermonsService.update(user(), S1, { title: 'Nova luz' });
  assert.equal(deliveries[0].title, 'Nova luz');
  assert.deepEqual(deliveries[0].slides.map((s: Row) => s.kind), ['TITLE', 'SUMMARY', 'POINT', 'POINT']);
});

test('resumo da lista traz slideCount (marcados, sem PRIVATE)', async () => {
  const slides = buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS').map((s) => (s.id === 'v1:0' ? { ...s, included: false } : s));
  const { sermonsService } = build({ sermons: [sermonRow({ slides })] });
  assert.equal((await sermonsService.get(user(), S1)).slideCount, 3);
  const listed = await sermonsService.list(user(), {});
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].slideCount, 3);
});

test('mudar só o título deixa os slides desatualizados (capa ou visão geral); Atualizar põe o título novo e limpa', async () => {
  for (const mode of ['TITLES', 'VERSES_AND_POINTS'] as const) {
    const { service, sermonsService } = build({ sermons: [sermonRow()] });
    await service.generate(user(), S1, { mode });
    const renamed = await sermonsService.update(user(), S1, { title: 'Nova luz' });
    assert.equal(renamed.slidesStale, true, mode);
    const again = await service.generate(user(), S1, { mode });
    assert.equal(again.slidesStale, false, mode);
    assert.equal(again.slides.find((s) => s.id === 'overview')!.heading, 'Nova luz', mode);
  }
});

test('título da capa editado à mão não fica desatualizado quando o título da palavra muda', async () => {
  const { service, sermonsService } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'TITLES' });
  await service.save(user(), S1, {
    items: gen.slides.map((s) => (s.kind === 'TITLE' ? { id: s.id, included: true, text: 'Meu título' } : { id: s.id, included: s.included })),
  });
  assert.equal((await sermonsService.update(user(), S1, { title: 'Nova luz' })).slidesStale, false);
});

// --- DTOs ------------------------------------------------------------------

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
async function parse<T>(metatype: Type<T>, body: unknown): Promise<T> {
  return (await pipe.transform(body, { type: 'body', metatype })) as T;
}
async function rejects(metatype: Type<unknown>, body: unknown) {
  await assert.rejects(parse(metatype, body), BadRequestException);
}

test('DTO de salvar recusa kind, reference, sourceBlockId, edited, layout, heading, items, subtitle e mais de 400 itens', async () => {
  for (const extra of [{ kind: 'VERSE' }, { reference: 'João 1:1' }, { sourceBlockId: 'v1' }, { edited: true }, { layout: 'VERSE' }, { heading: 'H' }, { items: ['a'] }, { subtitle: 'S' }]) {
    await rejects(SaveSlidesDto, { items: [{ id: 'v1:0', included: true, ...extra }] });
  }
  const many = Array.from({ length: 401 }, (_, i) => ({ id: `b${i}:0`, included: true }));
  await rejects(SaveSlidesDto, { items: many });
  assert.equal((await parse(SaveSlidesDto, { items: many.slice(0, 400) })).items.length, 400);
  await rejects(SaveSlidesDto, { items: [{ id: 'v1:0', included: 'sim' }] });
  await rejects(SaveSlidesDto, { items: [{ id: 'v1:0', included: true, text: 'x'.repeat(301) }] });
  await rejects(SaveSlidesDto, { items: [{ id: 'v1:0', included: true, text: '   ' }] });
  await rejects(SaveSlidesDto, { style: 'NEON', items: [] });
  await rejects(SaveSlidesDto, { slides: [], items: [] });
  const ok = await parse(SaveSlidesDto, { style: 'MINIMAL', items: [{ id: 'pt1:title', included: false, text: ' Oi ' }] });
  assert.equal(ok.items[0].text, 'Oi');
});

test('DTO de gerar aceita só "Com versículos" e "Só títulos"; recusa os modos antigos e model', async () => {
  for (const mode of ['VERSES_AND_POINTS', 'TITLES']) assert.equal((await parse(GenerateSlidesDto, { mode })).mode, mode);
  await rejects(GenerateSlidesDto, {});
  for (const mode of ['VERSES', 'FULL', 'ALL']) await rejects(GenerateSlidesDto, { mode });
  await rejects(GenerateSlidesDto, { mode: 'TITLES', style: 'NEON' });
  await rejects(GenerateSlidesDto, { mode: 'TITLES', slides: [] });
  await rejects(GenerateSlidesDto, { mode: 'TITLES', model: 'anthropic:claude-opus-5-5' });
});

// --- Linhas antigas do envio ----------------------------------------------

test('readDeliverySlides aceita linhas antigas (só kind/text/reference, ou M01–M04 com subtitle)', () => {
  const old = [
    { kind: 'TITLE', text: 'Luz', reference: null },
    { kind: 'VERSE', text: 'Eu sou a luz do mundo.', reference: 'João 8:12' },
    { kind: 'VERSE', text: 'Eu sou.', layout: 'M04', title: 'A luz chama', subtitle: 'Liga', verse: 'Eu sou.', reference: 'João 8:12 · BLIVRE' },
    { kind: 'POINT', text: 'A luz chama', reference: null, layout: 'M02', title: 'A luz chama', subtitle: 'Sub', verse: null },
    { kind: 'SUMMARY', text: 'Lanterna', reference: null, layout: 'M02', title: 'Conclusão', subtitle: 'Lanterna', verse: null },
    { kind: 'PRIVATE', text: 'segredo', reference: null },
    { kind: 'VERSE', text: 3, reference: 'x' },
  ];
  assert.deepEqual(readDeliverySlides(old), [
    { kind: 'TITLE', text: 'Luz', layout: 'TITLE', title: 'Luz', verse: null, reference: null, items: null, start: null },
    { kind: 'VERSE', text: 'Eu sou a luz do mundo.', layout: 'VERSE', title: 'João 8:12', verse: 'Eu sou a luz do mundo.', reference: 'João 8:12', items: null, start: null },
    { kind: 'VERSE', text: 'Eu sou.', layout: 'VERSE', title: 'A luz chama', verse: 'Eu sou.', reference: 'João 8:12 · BLIVRE', items: null, start: null },
    { kind: 'POINT', text: 'A luz chama', layout: 'TITLE', title: 'A luz chama', verse: null, reference: null, items: null, start: null },
    { kind: 'SUMMARY', text: 'Lanterna', layout: 'BULLETS', title: 'Conclusão', verse: null, reference: null, items: ['Lanterna'], start: null },
  ]);
});
