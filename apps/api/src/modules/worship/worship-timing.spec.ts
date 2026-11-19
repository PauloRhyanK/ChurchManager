import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { GenerationLimiter } from '../sermons/ai/generation-limiter';
import type { AlignInput, AlignOutput, TimingAligner } from './ai/timing-aligner';
import { WorshipTimingService } from './worship-timing.service';
import type { WorshipRow } from './worship-document';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROWS: WorshipRow[] = [
  { id: 'a', type: 'lyric', text: 'Um', part: { kind: 'VERSE', mood: null }, time: 10 },
  { id: 'b', type: 'break' },
  { id: 'c', type: 'lyric', text: 'Dois', time: 20 },
  { id: 'd', type: 'lyric', text: 'Três', part: { kind: 'CHORUS', mood: null }, time: 30 },
];

function build(output: AlignOutput | null, opts: { enabled?: boolean } = {}) {
  const created: unknown[] = [];
  let sent: AlignInput | null = null;
  const prisma = {
    worshipSong: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.tenantId === TENANT && where.id === 's1' ? { id: 's1', tenantId: TENANT, rows: ROWS, audioDurationSeconds: 60 } : null,
    },
    worshipSettings: { findUnique: async () => null, upsert: async () => ({}) },
    worshipTimingCorrection: {
      findMany: async () => [{ source: 'DRAG', instruction: null, changedSlides: 1, meanDeltaSeconds: -0.5, slideShift: null }],
      create: async ({ data }: { data: unknown }) => created.push(data),
    },
  };
  const aligner = output
    ? ({ align: async (input: AlignInput) => ((sent = input), output) } as unknown as TimingAligner)
    : null;
  const ai = { enabled: opts.enabled ?? true, models: [{ id: 'anthropic:m', provider: 'anthropic' as const, model: 'm', label: 'm' }], effort: 'low' as const };
  const svc = new WorshipTimingService(prisma as never, ai, aligner, new GenerationLimiter(2));
  return { svc, created, sent: () => sent };
}

test('sugestão: manda slides, antecipação padrão e o aprendido; devolve antes e depois', async () => {
  const { svc, sent } = build({ times: [5, 10, 20], summary: 'Voltei um slide.' });
  const out = await svc.suggest(TENANT, 'u1', 's1', { instruction: 'volta um slide em tudo' });
  assert.deepEqual(out.before, [10, 20, 30]);
  assert.deepEqual(out.times, [5, 10, 20]);
  assert.deepEqual(out.slideIds, ['a', 'c', 'd']);
  const input = sent()!;
  assert.equal(input.leadSeconds, 0.3);
  assert.equal(input.slides[2].part, 'Refrão');
  assert.equal(input.learned.meanFineDeltaSeconds, -0.5);
});

test('sugestão: saída fora de ordem ou fora do áudio é recusada no servidor', async () => {
  await assert.rejects(build({ times: [5, 4, 20], summary: '' }).svc.suggest(TENANT, 'u', 's1', { instruction: 'x' }), UnprocessableEntityException);
  await assert.rejects(build({ times: [5, 10, 61], summary: '' }).svc.suggest(TENANT, 'u', 's1', { instruction: 'x' }), UnprocessableEntityException);
});

test('sugestão: sem chave configurada, recusa com mensagem', async () => {
  await assert.rejects(build(null).svc.suggest(TENANT, 'u', 's1', { instruction: 'x' }), BadRequestException);
});

test('correção: guarda a diferença e reconhece o deslocamento; lista de outro tamanho é recusada', async () => {
  const { svc, created } = build(null);
  const out = await svc.recordCorrection(TENANT, 's1', { source: 'SHIFT_SLIDES', before: [10, 20, 30], after: [0, 10, 20] });
  assert.equal(out.recorded, true);
  assert.equal((created[0] as { slideShift: number }).slideShift, -1);
  assert.equal((created[0] as { instruction: unknown }).instruction, null);
  await assert.rejects(svc.recordCorrection(TENANT, 's1', { source: 'DRAG', before: [1], after: [2] }), BadRequestException);
  await assert.rejects(svc.recordCorrection(TENANT, 's1', { source: 'DRAG', before: [1, 2, 'x'], after: [1, 2, 3] }), BadRequestException);
  assert.deepEqual(await svc.recordCorrection(TENANT, 's1', { source: 'DRAG', before: [1, 2, 3], after: [1, 2, 3] }), { recorded: false });
});
