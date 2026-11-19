import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, HttpException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import type { AuthUser } from '../auth/auth-user';
import { GenerateSlidesDto, SaveSlidesDto } from './dto/slides.dto';
import { EXAMPLE_DOC } from './sermon-example';
import { GenerationLimiter } from './ai/generation-limiter';
import type { SermonAiConfig } from './ai/sermon-ai.config';
import { SummarizerError, type SermonSummarizer, type SummarizeInput } from './ai/sermon-summarizer';
import { buildSlides, type SlideItem } from './sermon-slides';
import { SermonSlidesService } from './sermon-slides.service';
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

const AI_ON: SermonAiConfig = {
  enabled: true,
  effort: 'low',
  models: [
    { id: 'anthropic:claude-opus-5-5', provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'anthropic:claude-sonnet-5-5', provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  ],
};
const AI_OFF: SermonAiConfig = { ...AI_ON, enabled: false };

/** Resumidor falso: registra as chamadas e devolve uma frase por alvo (ou o que `reply` mandar). */
function fakeSummarizer(reply?: (input: SummarizeInput) => Promise<{ id: string; text: string }[]>) {
  const calls: SummarizeInput[] = [];
  const summarizer: SermonSummarizer = {
    summarize: async (input) => {
      calls.push(structuredClone(input));
      return reply ? reply(input) : input.targets.map((t) => ({ id: t.id, text: `Resumo de ${t.id}` }));
    },
  };
  return { summarizer, calls };
}

function build(init: { sermons: Row[]; deliveries?: Row[]; config?: SermonAiConfig; summarizer?: SermonSummarizer; limiter?: GenerationLimiter }) {
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
  const fake = fakeSummarizer();
  const service = new SermonSlidesService(
    prisma as never,
    sermonsService,
    init.config ?? AI_OFF,
    { anthropic: init.summarizer ?? fake.summarizer },
    init.limiter ?? new GenerationLimiter(),
  );
  return { service, sermonsService, sermons, deliveries, writes, updates };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const asInput = (items: SlideItem[]) => items.map((s) => ({ id: s.id, included: s.included }));

test('generate em palavra sem slides grava a sequência, o modo, o estilo e slidesRevision', async () => {
  const { service, sermons } = build({ sermons: [sermonRow()] });
  const out = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS', style: 'BACKGROUND' });
  assert.deepEqual(ids(out.slides), ['title', 'v1:0', 'pt1:0', 'v2:0', 'pt2:0', 'n1:0']);
  assert.equal(out.slideMode, 'VERSES_AND_POINTS');
  assert.equal(out.slideStyle, 'BACKGROUND');
  assert.equal(out.slidesStale, false);
  assert.equal(sermons[0].slidesRevision, 3);
  assert.equal(sermons[0].revision, 3, 'gerar não mexe na revisão do documento');
  assert.equal(out.slideCount, 5);
});

test('FULL dá 400 com a mensagem combinada e nada é escrito', async () => {
  const { service, writes } = build({ sermons: [sermonRow()] });
  await assert.rejects(
    service.generate(user(), S1, { mode: 'FULL' }),
    (e: any) => e instanceof BadRequestException && e.message === 'Slides completos ainda não estão disponíveis.',
  );
  assert.deepEqual(writes, []);
});

test('gerar de novo no mesmo modo preserva item desmarcado e texto editado; trocar de modo recomeça', async () => {
  const { service } = build({ sermons: [sermonRow()] });
  const first = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const items = first.slides.map((s) => ({
    id: s.id,
    included: s.id === 'v2:0' ? false : s.included,
    ...(s.id === 'pt1:0' ? { text: 'A luz nos chama' } : {}),
  }));
  await service.save(user(), S1, { items });
  const again = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  assert.equal(again.slides.find((s) => s.id === 'v2:0')!.included, false);
  const pt = again.slides.find((s) => s.id === 'pt1:0')!;
  assert.deepEqual([pt.text, pt.edited], ['A luz nos chama', true]);

  const other = await service.generate(user(), S1, { mode: 'VERSES' });
  assert.deepEqual(other.slides, buildSlides('Luz', EXAMPLE_DOC, 'VERSES'));
  assert.equal(other.slideMode, 'VERSES');
});

test('save grava a nova ordem; PRIVATE marcado fica false e no fim; não mexe nas revisões', async () => {
  const { service, sermons } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const reordered = [...gen.slides].reverse().map((s) => ({ id: s.id, included: true }));
  const out = await service.save(user(), S1, { style: 'BACKGROUND', items: reordered });
  assert.deepEqual(ids(out.slides), ['pt2:0', 'v2:0', 'pt1:0', 'v1:0', 'title', 'n1:0']);
  const priv = out.slides.find((s) => s.kind === 'PRIVATE')!;
  assert.equal(priv.included, false);
  assert.equal(out.slideStyle, 'BACKGROUND');
  assert.equal(sermons[0].revision, 3);
  assert.equal(sermons[0].slidesRevision, 3);
  assert.equal(out.slideCount, 5);
});

test('save com id desconhecido, repetido ou faltando dá 400 sem escrita', async () => {
  const { service, writes } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES' });
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

test('text em VERSE e PRIVATE é ignorado; em POINT aparado marca edited; 301 caracteres dá 400', async () => {
  const { service, writes } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const items = gen.slides.map((s) => ({
    id: s.id,
    included: s.included,
    ...(s.kind === 'VERSE' || s.kind === 'PRIVATE' ? { text: 'trocado' } : {}),
    ...(s.id === 'pt1:0' ? { text: '  Novo ponto  ' } : {}),
    ...(s.id === 'title' ? { text: s.text } : {}),
  }));
  const out = await service.save(user(), S1, { items });
  for (const s of out.slides.filter((x) => x.kind === 'VERSE' || x.kind === 'PRIVATE')) assert.notEqual(s.text, 'trocado');
  const pt = out.slides.find((s) => s.id === 'pt1:0')!;
  assert.deepEqual([pt.text, pt.edited], ['Novo ponto', true]);
  assert.equal(out.slides.find((s) => s.id === 'title')!.edited, false, 'texto igual ao gravado não marca edited');

  writes.length = 0;
  const long = gen.slides.map((s) => ({ id: s.id, included: true, ...(s.id === 'pt1:0' ? { text: 'x'.repeat(301) } : {}) }));
  await assert.rejects(service.save(user(), S1, { items: long }), BadRequestException);
  assert.deepEqual(writes, []);
});

test('palavra de outro autor (inclusive administrador) e de outro tenant: 404 sem escrita', async () => {
  const { service, writes } = build({ sermons: [sermonRow({ slides: buildSlides('Luz', EXAMPLE_DOC, 'VERSES'), slideMode: 'VERSES' })] });
  const intruders = [
    user({ userId: OTHER, role: 'TENANT_ADMIN' as never }),
    user({ userId: OTHER, role: 'PLATFORM_ADMIN' as never }),
    user({ tenantId: OTHER_TENANT }),
  ];
  const items = asInput(buildSlides('Luz', EXAMPLE_DOC, 'VERSES'));
  for (const intruder of intruders) {
    await assert.rejects(service.generate(intruder, S1, { mode: 'VERSES' }), NotFoundException);
    await assert.rejects(service.save(intruder, S1, { items }), NotFoundException);
  }
  assert.deepEqual(writes, []);
});

test('as escritas filtram por id, tenant e autor', async () => {
  const { service, updates } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES' });
  await service.save(user(), S1, { items: asInput(gen.slides) });
  assert.equal(updates.length, 2);
  for (const u of updates) {
    assert.deepEqual({ id: u.where.id, tenantId: u.where.tenantId, authorId: u.where.authorId }, { id: S1, tenantId: TENANT, authorId: AUTHOR });
  }
});

test('slidesStale vira true depois de salvar o documento e false depois de generate; autosave não mexe nos slides', async () => {
  const { service, sermonsService, sermons } = build({ sermons: [sermonRow()] });
  await service.generate(user(), S1, { mode: 'VERSES' });
  const before = structuredClone(sermons[0].slides);
  const saved = await sermonsService.update(user(), S1, { document: EXAMPLE_DOC as never, baseRevision: 3 });
  assert.equal(saved.slidesStale, true);
  assert.deepEqual(sermons[0].slides, before);
  assert.equal((await sermonsService.get(user(), S1)).slidesStale, true);
  assert.equal((await service.generate(user(), S1, { mode: 'VERSES' })).slidesStale, false);
  const fresh = await sermonsService.get(user(), sermons[0].id);
  assert.equal(fresh.slidesStale, false);
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
  assert.equal(copy.slides.length, 5);
  assert.equal(copy.slides.some((s: Row) => s.kind === 'PRIVATE'), false);
  assert.equal(JSON.stringify(copy.slides).includes('Dois minutos'), false, 'o texto da nota privada não sai');
  for (const s of copy.slides) assert.deepEqual(Object.keys(s).sort(), ['kind', 'reference', 'text']);

  const original = deliveryRow('2026-11-15');
  const preached = build({ sermons: [sermonRow()], deliveries: [original] });
  await preached.service.generate(user(), S1, { mode: 'VERSES' });
  const g2 = await preached.sermonsService.get(user(), S1);
  await preached.service.save(user(), S1, { style: 'BACKGROUND', items: asInput(g2.slides) });
  await preached.sermonsService.update(user(), S1, { title: 'Outro título' });
  assert.deepEqual(preached.deliveries[0], original);
  assert.equal(preached.writes.includes('delivery.update'), false);
});

test('salvar título de palavra Enviada copia título, tempo e slides públicos para o envio', async () => {
  const { service, sermonsService, deliveries } = build({ sermons: [sermonRow()], deliveries: [deliveryRow('2026-11-22')] });
  await service.generate(user(), S1, { mode: 'VERSES' });
  deliveries[0].slides = [];
  await sermonsService.update(user(), S1, { title: 'Nova luz' });
  assert.equal(deliveries[0].title, 'Nova luz');
  assert.deepEqual(deliveries[0].slides.map((s: Row) => s.kind), ['VERSE', 'VERSE']);
});

test('resumo da lista traz slideCount (marcados, sem PRIVATE)', async () => {
  const slides = buildSlides('Luz', EXAMPLE_DOC, 'VERSES_AND_POINTS').map((s) => (s.id === 'v1:0' ? { ...s, included: false } : s));
  const { sermonsService } = build({ sermons: [sermonRow({ slides })] });
  assert.equal((await sermonsService.get(user(), S1)).slideCount, 4);
  const listed = await sermonsService.list(user(), {});
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].slideCount, 4);
});

test('mudar só o título deixa os slides desatualizados; Atualizar (mesmo modo) põe o título novo e limpa', async () => {
  const { service, sermonsService } = build({ sermons: [sermonRow()] });
  await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  const renamed = await sermonsService.update(user(), S1, { title: 'Nova luz' });
  assert.equal(renamed.slidesStale, true);
  assert.equal((await sermonsService.get(user(), S1)).slidesStale, true);
  const again = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  assert.equal(again.slidesStale, false);
  assert.equal(again.slides.find((s) => s.kind === 'TITLE')!.text, 'Nova luz');
});

test('título do slide editado à mão não fica desatualizado quando o título da palavra muda', async () => {
  const { service, sermonsService } = build({ sermons: [sermonRow()] });
  const gen = await service.generate(user(), S1, { mode: 'VERSES_AND_POINTS' });
  await service.save(user(), S1, {
    items: gen.slides.map((s) => (s.kind === 'TITLE' ? { id: s.id, included: true, text: 'Meu título' } : { id: s.id, included: s.included })),
  });
  assert.equal((await sermonsService.update(user(), S1, { title: 'Nova luz' })).slidesStale, false);
});

test('modo só versículos (sem TITLE) não fica desatualizado pela troca de título', async () => {
  const { service, sermonsService } = build({ sermons: [sermonRow()] });
  await service.generate(user(), S1, { mode: 'VERSES' });
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

test('DTO de salvar recusa kind, reference, sourceBlockId, edited e mais de 400 itens', async () => {
  for (const extra of [{ kind: 'VERSE' }, { reference: 'João 1:1' }, { sourceBlockId: 'v1' }, { edited: true }]) {
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
  const ok = await parse(SaveSlidesDto, { style: 'MINIMAL', items: [{ id: 'pt1:0', included: false, text: ' Oi ' }] });
  assert.equal(ok.items[0].text, 'Oi');
});

test('DTO de gerar aceita os três modos e recusa o resto', async () => {
  for (const mode of ['VERSES', 'VERSES_AND_POINTS', 'FULL']) assert.equal((await parse(GenerateSlidesDto, { mode })).mode, mode);
  await rejects(GenerateSlidesDto, {});
  await rejects(GenerateSlidesDto, { mode: 'ALL' });
  await rejects(GenerateSlidesDto, { mode: 'VERSES', style: 'NEON' });
  await rejects(GenerateSlidesDto, { mode: 'VERSES', slides: [] });
});

// --- Slides completos (IA) -------------------------------------------------

const TARGET_IDS = ['opening:0', 'i1:0', 'a1:0'];
const rejectsWith = (p: Promise<unknown>, status: number, message: string) =>
  assert.rejects(p, (e: any) => e instanceof HttpException && e.getStatus() === status && e.message === message);

test('FULL com a IA desligada: 400 e nenhuma chamada', async () => {
  const f = fakeSummarizer();
  const { service, writes } = build({ sermons: [sermonRow()], config: AI_OFF, summarizer: f.summarizer });
  await rejectsWith(service.generate(user(), S1, { mode: 'FULL' }), 400, 'Slides completos ainda não estão disponíveis.');
  assert.equal(f.calls.length, 0);
  assert.deepEqual(writes, []);
});

test('FULL com model fora da lista: 400 e nenhuma chamada; sem model usa o primeiro', async () => {
  const f = fakeSummarizer();
  const { service } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  await rejectsWith(service.generate(user(), S1, { mode: 'FULL', model: 'anthropic:outro' }), 400, 'Modelo indisponível.');
  assert.equal(f.calls.length, 0);
  await service.generate(user(), S1, { mode: 'FULL' });
  assert.equal(f.calls[0].model, 'claude-opus-5-5');
  assert.equal(f.calls[0].effort, 'low');
  await service.generate(user(), S1, { mode: 'FULL', model: 'anthropic:claude-sonnet-5-5' });
  assert.equal(f.calls[1].model, 'claude-sonnet-5-5');
});

test('FULL em palavra sem alvos: nenhuma chamada nem uso do limite, e o resultado é o de Versículos e pontos', async () => {
  const f = fakeSummarizer();
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Curto.' }] }] };
  const limiter = new GenerationLimiter(1);
  const { service } = build({ sermons: [sermonRow({ document: doc })], config: AI_ON, summarizer: f.summarizer, limiter });
  const out = await service.generate(user(), S1, { mode: 'FULL' });
  assert.equal(f.calls.length, 0);
  assert.equal(limiter.take(AUTHOR), true, 'o limite não foi gasto');
  assert.equal(out.slideMode, 'FULL');
  assert.deepEqual(out.slides, buildSlides('Luz', doc as never, 'VERSES_AND_POINTS'));
});

test('FULL feliz: SUMMARY nas posições certas, modo FULL, envio atualizado sem PRIVATE e sem a nota privada no pedido', async () => {
  const f = fakeSummarizer();
  const { service, sermons, deliveries } = build({
    sermons: [sermonRow()],
    deliveries: [deliveryRow('2026-11-22')],
    config: AI_ON,
    summarizer: f.summarizer,
  });
  const out = await service.generate(user(), S1, { mode: 'FULL' });
  assert.deepEqual(f.calls[0].targets.map((t) => t.id), TARGET_IDS);
  assert.equal(JSON.stringify(f.calls[0]).includes('Dois minutos'), false, 'a nota privada não vai ao provedor');
  const summaries = out.slides.filter((s) => s.kind === 'SUMMARY');
  assert.deepEqual(ids(summaries), TARGET_IDS);
  assert.deepEqual(
    out.slides.map((s) => s.id),
    ids(buildSlides('Luz', EXAMPLE_DOC, 'FULL', Object.fromEntries(TARGET_IDS.map((id) => [id, `Resumo de ${id}`])))),
  );
  assert.equal(out.slideMode, 'FULL');
  assert.equal(sermons[0].slidesRevision, 3);
  const copy = deliveries[0].slides as Row[];
  assert.equal(copy.some((s) => s.kind === 'PRIVATE'), false);
  assert.deepEqual(copy.filter((s) => s.kind === 'SUMMARY').length, 3);
  assert.equal(JSON.stringify(copy).includes('Dois minutos'), false);
});

test('a 11ª geração na hora dá 429 sem chamada ao provedor', async () => {
  const f = fakeSummarizer();
  const { service } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  for (let i = 0; i < 10; i++) await service.generate(user(), S1, { mode: 'FULL' });
  assert.equal(f.calls.length, 10);
  await rejectsWith(
    service.generate(user(), S1, { mode: 'FULL' }),
    429,
    'Você gerou slides completos muitas vezes na última hora. Tente de novo mais tarde.',
  );
  assert.equal(f.calls.length, 10);
});

test('cada SummarizerError vira a resposta combinada e nada é gravado', async () => {
  const table: [SummarizerError['reason'], number, string][] = [
    ['AUTH', 503, 'A chave do provedor de IA não foi aceita. Avise o administrador.'],
    ['RATE_LIMIT', 503, 'O provedor de IA não respondeu. Tente de novo em instantes.'],
    ['UNAVAILABLE', 503, 'O provedor de IA não respondeu. Tente de novo em instantes.'],
    ['REFUSED', 422, 'O modelo não pôde resumir esta palavra. Use “Versículos e pontos”.'],
    ['TRUNCATED', 502, 'A resposta do modelo veio incompleta. Tente de novo.'],
    ['INVALID', 502, 'A resposta do modelo veio incompleta. Tente de novo.'],
    ['CONFIG', 503, 'O modelo configurado não aceitou o pedido. Avise o administrador.'],
  ];
  for (const [reason, status, message] of table) {
    const f = fakeSummarizer(async () => {
      throw new SummarizerError(reason, 'sk-ant-segredo corpo do pedido');
    });
    const before = buildSlides('Luz', EXAMPLE_DOC, 'VERSES');
    const { service, writes, sermons } = build({
      sermons: [sermonRow({ slides: before, slideMode: 'VERSES', slidesRevision: 3 })],
      config: AI_ON,
      summarizer: f.summarizer,
    });
    await assert.rejects(service.generate(user(), S1, { mode: 'FULL' }), (e: any) => {
      assert.ok(e instanceof HttpException);
      assert.equal(e.getStatus(), status, reason);
      assert.equal(e.message, message, reason);
      assert.equal(JSON.stringify(e.getResponse()).includes('segredo'), false);
      return true;
    });
    assert.deepEqual(writes, [], reason);
    assert.deepEqual(sermons[0].slides, before);
    assert.equal(sermons[0].slideMode, 'VERSES');
  }
});

test('documento salvo durante a geração: 409 e nada gravado', async () => {
  let bump: () => void = () => {};
  const f = fakeSummarizer(async (input) => {
    bump();
    return input.targets.map((t) => ({ id: t.id, text: 'x' }));
  });
  const { service, writes, sermons } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  bump = () => {
    sermons[0].revision = 4;
  };
  await assert.rejects(
    service.generate(user(), S1, { mode: 'FULL' }),
    (e: any) => e instanceof ConflictException && e.message === 'A palavra mudou enquanto os slides eram gerados. Gere de novo.',
  );
  assert.deepEqual(writes, []);
  assert.deepEqual(sermons[0].slides, []);
});

test('o provedor é chamado fora da transação', async () => {
  let inTx = false;
  const f = fakeSummarizer(async (input) => {
    assert.equal(inTx, false);
    return input.targets.map((t) => ({ id: t.id, text: 'ok' }));
  });
  const { service } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  const prisma = (service as any).prisma;
  const original = prisma.$transaction;
  prisma.$transaction = async (fn: any) => {
    inTx = true;
    try {
      return await original(fn);
    } finally {
      inTx = false;
    }
  };
  await service.generate(user(), S1, { mode: 'FULL' });
});

test('gerar FULL de novo preserva frase editada e item desmarcado', async () => {
  const f = fakeSummarizer();
  const { service } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  const first = await service.generate(user(), S1, { mode: 'FULL' });
  await service.save(user(), S1, {
    items: first.slides.map((s) => ({
      id: s.id,
      included: s.id === 'i1:0' ? false : s.included,
      ...(s.id === 'opening:0' ? { text: 'Minha abertura' } : {}),
    })),
  });
  const again = await service.generate(user(), S1, { mode: 'FULL' });
  const opening = again.slides.find((s) => s.id === 'opening:0')!;
  assert.deepEqual([opening.text, opening.edited], ['Minha abertura', true]);
  assert.equal(again.slides.find((s) => s.id === 'i1:0')!.included, false);
});

test('FULL em palavra de outro autor: 404 sem chamada ao provedor', async () => {
  const f = fakeSummarizer();
  const { service, writes } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  await assert.rejects(service.generate(user({ userId: OTHER }), S1, { mode: 'FULL' }), NotFoundException);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(writes, []);
});

test('aiOptions devolve só enabled e models com id e label', () => {
  const { service } = build({ sermons: [], config: AI_ON });
  assert.deepEqual(service.aiOptions(), {
    enabled: true,
    models: [
      { id: 'anthropic:claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'anthropic:claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    ],
  });
  assert.deepEqual(build({ sermons: [], config: AI_OFF }).service.aiOptions(), { enabled: false, models: [] });
});

test('DTO de gerar aceita model de até 80 caracteres e recusa 81', async () => {
  assert.equal((await parse(GenerateSlidesDto, { mode: 'FULL', model: 'm'.repeat(80) })).model?.length, 80);
  await rejects(GenerateSlidesDto, { mode: 'FULL', model: 'm'.repeat(81) });
});

test('falha do provedor registra só reason, status, type e o modelo; outra falha só o nome do erro', async () => {
  const logs: string[] = [];
  const err = new SummarizerError('CONFIG', 'sk-ant-segredo corpo do pedido', { status: 400, type: 'invalid_request_error' });
  const f = fakeSummarizer(async () => {
    throw err;
  });
  const { service } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  (service as any).logger = { warn: (m: string) => logs.push(m), log: (m: string) => logs.push(m), error: (m: string) => logs.push(m) };
  await rejectsWith(service.generate(user(), S1, { mode: 'FULL' }), 503, 'O modelo configurado não aceitou o pedido. Avise o administrador.');
  assert.deepEqual(logs, ['Resumo por IA falhou: reason=CONFIG status=400 type=invalid_request_error model=claude-opus-5-5']);

  logs.length = 0;
  const bug = new TypeError('Dois minutos sk-ant-segredo');
  const g = fakeSummarizer(async () => {
    throw bug;
  });
  const other = build({ sermons: [sermonRow()], config: AI_ON, summarizer: g.summarizer });
  (other.service as any).logger = { warn: (m: string) => logs.push(m), log: (m: string) => logs.push(m), error: (m: string) => logs.push(m) };
  await rejectsWith(other.service.generate(user(), S1, { mode: 'FULL' }), 503, 'O provedor de IA não respondeu. Tente de novo em instantes.');
  assert.deepEqual(logs, ['Resumo por IA falhou: TypeError model=claude-opus-5-5']);
});

test('gerar FULL de novo: frase editada continua mesmo se o modelo omitir o alvo', async () => {
  let omit = false;
  const f = fakeSummarizer(async (input) =>
    input.targets.filter((t) => !(omit && (t.id === 'opening:0' || t.id === 'a1:0'))).map((t) => ({ id: t.id, text: `Resumo de ${t.id}` })),
  );
  const { service } = build({ sermons: [sermonRow()], config: AI_ON, summarizer: f.summarizer });
  const first = await service.generate(user(), S1, { mode: 'FULL' });
  await service.save(user(), S1, {
    items: first.slides.map((s) => ({ id: s.id, included: s.included, ...(s.id === 'opening:0' ? { text: 'Minha abertura' } : {}) })),
  });
  omit = true;
  const again = await service.generate(user(), S1, { mode: 'FULL' });
  const opening = again.slides.find((s) => s.id === 'opening:0');
  assert.deepEqual([opening?.text, opening?.edited, opening?.kind], ['Minha abertura', true, 'SUMMARY']);
  assert.equal(again.slides.some((s) => s.id === 'a1:0'), false, 'omitido e não editado: some');
  assert.deepEqual(again.slides.filter((s) => s.kind === 'SUMMARY').map((s) => s.id), ['opening:0', 'i1:0']);
});

test('FULL: id não pedido (o da nota privada), id repetido e frase de 300 caracteres', async () => {
  const long = 'palavra '.repeat(40).trim() + ' ' + 'x'.repeat(20);
  const f = fakeSummarizer(async () => [
    { id: 'n1:0', text: 'Dois minutos nessa história' },
    { id: 'i1:0', text: 'Primeira' },
    { id: 'i1:0', text: 'Segunda' },
    { id: 'a1:0', text: long },
  ]);
  const { service, deliveries } = build({
    sermons: [sermonRow()],
    deliveries: [deliveryRow('2026-11-22')],
    config: AI_ON,
    summarizer: f.summarizer,
  });
  const out = await service.generate(user(), S1, { mode: 'FULL' });
  const summaries = out.slides.filter((s) => s.kind === 'SUMMARY');
  assert.deepEqual(summaries.map((s) => [s.id, s.text]), [
    ['i1:0', 'Primeira'],
    ['a1:0', Array(11).fill('palavra').join(' ')],
  ]);
  assert.ok(summaries.every((s) => s.text.length <= 90));
  assert.equal(out.slides.filter((s) => s.id === 'n1:0').length, 1);
  assert.equal(out.slides.find((s) => s.id === 'n1:0')!.kind, 'PRIVATE');
  assert.equal(out.slides.some((s) => s.kind === 'PRIVATE' && s.included), false);
  assert.equal(JSON.stringify(out.slides.filter((s) => s.kind !== 'PRIVATE')).includes('Dois minutos'), false);
  const copy = deliveries[0].slides as Row[];
  assert.equal(copy.some((s) => s.kind === 'PRIVATE'), false);
  assert.equal(JSON.stringify(copy).includes('Dois minutos'), false);
});
