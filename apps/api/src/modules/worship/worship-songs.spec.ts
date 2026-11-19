import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WorshipSongsService } from './worship-songs.service';
import type { WorshipRow } from './worship-document';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SONG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const COMPLETE: WorshipRow[] = [
  { id: 'a', type: 'lyric', text: 'Antes do sol nascer', part: { kind: 'VERSE', mood: 'WORSHIP' }, time: 1 },
  { id: 'b', type: 'lyric', text: 'És a luz da manhã', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: 9 },
];

function build(overrides: Record<string, unknown> = {}, inServices = 0) {
  const writes: { op: string; data?: Record<string, unknown> }[] = [];
  const deleted: (string | null)[] = [];
  const row: Record<string, unknown> = {
    id: SONG,
    tenantId: TENANT_B,
    title: 'Luz da Manhã',
    artist: null,
    musicalKey: null,
    bpm: null,
    timeSignature: null,
    rawLyrics: 'Antes do sol nascer\n\nÉs a luz da manhã',
    rows: COMPLETE,
    status: 'NEEDS_TIMING',
    audioUrl: 'https://cdn/a.mp3',
    audioFileName: 'a.mp3',
    audioDurationSeconds: 60,
    audioSizeBytes: 10,
    readyAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  const prisma = {
    worshipSong: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === row.id && where.tenantId === row.tenantId ? { ...row } : null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ op: 'update', data });
        return { ...row, ...data };
      },
      delete: async () => {
        writes.push({ op: 'delete' });
        return row;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ op: 'create', data });
        return { ...row, audioUrl: null, audioDurationSeconds: null, ...data };
      },
    },
    worshipServiceSong: { count: async () => inServices },
  };
  const storage = {
    uploadAudio: async () => ({ url: 'https://cdn/novo.mp3', sizeBytes: 123 }),
    deleteFileByPublicUrl: async (url: string | null) => {
      deleted.push(url);
    },
  };
  return { svc: new WorshipSongsService(prisma as never, storage as never), writes, deleted };
}

test('id de outro tenant → 404 e nada é escrito, em toda rota de escrita', async () => {
  const { svc, writes, deleted } = build();
  const calls: Array<() => Promise<unknown>> = [
    () => svc.get(TENANT_A, SONG),
    () => svc.update(TENANT_A, SONG, { title: 'x' }),
    () => svc.organize(TENANT_A, SONG, {}),
    () => svc.setAudio(TENANT_A, SONG, { buffer: Buffer.from('x') }, {}),
    () => svc.removeAudio(TENANT_A, SONG),
    () => svc.markReady(TENANT_A, SONG),
    () => svc.unmarkReady(TENANT_A, SONG),
    () => svc.remove(TENANT_A, SONG),
  ];
  for (const call of calls) await assert.rejects(call(), NotFoundException);
  assert.deepEqual(writes, []);
  assert.deepEqual(deleted, []);
});

test('criar com organize já devolve as partes; sem letra fica Rascunho', async () => {
  const { svc } = build();
  const organized = await svc.create(TENANT_B, { title: 'Nova', rawLyrics: 'Linha um\n\nLinha dois', organize: true });
  assert.equal(organized.slideCount, 2);
  assert.equal(organized.status, 'NEEDS_TIMING');
  const draft = await svc.create(TENANT_B, { title: 'Só o nome' });
  assert.equal(draft.status, 'DRAFT');
  assert.deepEqual(draft.rows, []);
});

test('marcar como pronta: completa passa; incompleta responde 400 dizendo o que falta', async () => {
  const ok = build();
  const ready = await ok.svc.markReady(TENANT_B, SONG);
  assert.equal(ready.status, 'READY');
  assert.equal(ok.writes[0].data?.status, 'READY');

  const semAudio = build({ audioUrl: null, audioDurationSeconds: null });
  await assert.rejects(semAudio.svc.markReady(TENANT_B, SONG), (err: unknown) => {
    assert.ok(err instanceof BadRequestException);
    assert.match(err.message, /enviar o áudio/);
    return true;
  });
  assert.deepEqual(semAudio.writes, []);

  const foraDeOrdem = build({ rows: [COMPLETE[0], { ...COMPLETE[1], time: 0.5 }] });
  await assert.rejects(foraDeOrdem.svc.markReady(TENANT_B, SONG), /tempo de todos os slides/);

  const rascunho = build({ rows: [] });
  await assert.rejects(rascunho.svc.markReady(TENANT_B, SONG), /letra organizada/);
});

test('edição que quebra uma música pronta derruba o "pronta"', async () => {
  const { svc, writes } = build({ status: 'READY', readyAt: new Date() });
  const semTempo = [COMPLETE[0], { id: 'b', type: 'lyric' as const, text: 'És a luz', part: COMPLETE[1].part }];
  const out = await svc.update(TENANT_B, SONG, { rows: semTempo });
  assert.equal(out.status, 'NEEDS_TIMING');
  assert.deepEqual(out.pending, ['TIMES']);
  assert.equal(writes[0].data?.readyAt, null);
});

test('edição que mantém a música completa não mexe no "pronta"', async () => {
  const readyAt = new Date();
  const { svc, writes } = build({ status: 'READY', readyAt });
  const out = await svc.update(TENANT_B, SONG, { title: 'Outro nome' });
  assert.equal(out.status, 'READY');
  assert.equal(writes[0].data?.readyAt, readyAt);
  assert.equal(writes[0].data?.rows, undefined, 'sem rows no corpo, o documento não é regravado');
});

test('organizar de novo apaga tempos e o "pronta"', async () => {
  const { svc } = build({ status: 'READY', readyAt: new Date() });
  const out = await svc.organize(TENANT_B, SONG, {});
  assert.equal(out.status, 'NEEDS_TIMING');
  assert.ok(out.rows.every((r) => r.time === undefined));
  assert.deepEqual(out.pending, ['TIMES']);
});

test('trocar o áudio apaga o arquivo anterior; remover derruba para pendente', async () => {
  const { svc, deleted, writes } = build({ status: 'READY', readyAt: new Date() });
  const out = await svc.setAudio(TENANT_B, SONG, { buffer: Buffer.from('x'), originalname: 'novo.mp3' }, { durationSeconds: 30 });
  assert.equal(out.audio?.url, 'https://cdn/novo.mp3');
  assert.equal(out.audio?.fileName, 'novo.mp3');
  assert.deepEqual(deleted, ['https://cdn/a.mp3']);
  assert.equal(writes[0].data?.status, 'READY');

  const removed = build({ status: 'READY', readyAt: new Date() });
  const semAudio = await removed.svc.removeAudio(TENANT_B, SONG);
  assert.equal(semAudio.audio, null);
  assert.deepEqual(semAudio.pending, ['AUDIO']);
});

test('áudio novo mais curto que os tempos marcados deixa de estar pronta', async () => {
  const { svc } = build({ status: 'READY', readyAt: new Date() });
  const out = await svc.setAudio(TENANT_B, SONG, { buffer: Buffer.from('x') }, { durationSeconds: 5 });
  assert.equal(out.status, 'NEEDS_TIMING');
  assert.deepEqual(out.pending, ['TIMES']);
});

test('música em roteiro não pode ser apagada (409)', async () => {
  const { svc, writes } = build({}, 2);
  await assert.rejects(svc.remove(TENANT_B, SONG), ConflictException);
  assert.deepEqual(writes, []);
  const livre = build();
  await livre.svc.remove(TENANT_B, SONG);
  assert.deepEqual(livre.writes.map((w) => w.op), ['delete']);
  assert.deepEqual(livre.deleted, ['https://cdn/a.mp3']);
});
