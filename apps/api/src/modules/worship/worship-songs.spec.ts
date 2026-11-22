import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { WorshipSong } from '@prisma/client';
import { WorshipSongsService } from './worship-songs.service';
import type { WorshipRow } from './worship-document';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const SONG = '33333333-3333-4333-8333-333333333333';

const COMPLETE: WorshipRow[] = [
  { id: 'a', type: 'lyric', text: 'Antes do sol nascer', part: { kind: 'VERSE', mood: 'WORSHIP' }, time: 1 },
  { id: 'b', type: 'lyric', text: 'És a luz da manhã', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: 9 },
];

function build(overrides: Partial<WorshipSong> = {}, inServices = 0) {
  const row: WorshipSong = {
    id: SONG,
    tenantId: TENANT_B,
    title: 'Luz da Manhã',
    artist: null,
    musicalKey: null,
    bpm: null,
    timeSignature: null,
    holyricsId: null,
    rawLyrics: 'Antes do sol nascer\n\nÉs a luz da manhã',
    rows: COMPLETE as never,
    status: 'NEEDS_TIMING',
    audioUrl: 'https://cdn/a.mp3',
    audioFileName: 'a.mp3',
    audioDurationSeconds: 60,
    audioSizeBytes: 10,
    readyAt: null,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    updatedAt: new Date('2026-11-20T10:00:00Z'),
    ...overrides,
  };
  const writes: Array<{ op: string; data?: Record<string, unknown> }> = [];
  const deleted: Array<string | null> = [];
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
  const youtube = {
    search: async () => [],
    import: async () => ({
      title: 'Música YT',
      lyrics: 'Letra YT',
      audio: { url: 'https://cdn/yt.mp3', fileName: 'musica-yt.mp3', durationSeconds: 180, sizeBytes: 500 },
    }),
  };
  return { svc: new WorshipSongsService(prisma as never, storage as never, youtube as never), writes, deleted };
}

test('id de outro tenant → 404 e nada é escrito, em toda rota de escrita', async () => {
  const { svc, writes, deleted } = build();
  const calls: Array<() => Promise<unknown>> = [
    () => svc.get(TENANT_A, SONG),
    () => svc.update(TENANT_A, SONG, { title: 'x' }),
    () => svc.organize(TENANT_A, SONG, {}),
    () => svc.setAudio(TENANT_A, SONG, { buffer: Buffer.from('x') }, {}),
    () => svc.setYoutubeAudio(TENANT_A, SONG, 'yt-id'),
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

test('criar com audio recebido já vincula o arquivo', async () => {
  const { svc } = build();
  const created = await svc.create(TENANT_B, {
    title: 'Com áudio',
    rawLyrics: 'Linha um',
    organize: true,
    audio: { url: 'https://cdn/link.mp3', fileName: 'link.mp3', durationSeconds: 120, sizeBytes: 5000 },
  });
  assert.equal(created.audio?.url, 'https://cdn/link.mp3');
  assert.equal(created.audio?.durationSeconds, 120);
});

test('setYoutubeAudio baixa o áudio do YouTube e atualiza a música', async () => {
  const { svc, writes, deleted } = build({ status: 'READY', readyAt: new Date() });
  const out = await svc.setYoutubeAudio(TENANT_B, SONG, 'abc123');
  assert.equal(out.audio?.url, 'https://cdn/yt.mp3');
  assert.equal(out.audio?.fileName, 'musica-yt.mp3');
  assert.deepEqual(deleted, ['https://cdn/a.mp3']);
  assert.equal(writes[0].data?.status, 'NEEDS_TIMING');
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

  const foraDeOrdem = build({ rows: [COMPLETE[0], { ...COMPLETE[1], time: 0.5 }] as never });
  await assert.rejects(foraDeOrdem.svc.markReady(TENANT_B, SONG), /marcar o tempo de todos os slides/);

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
  assert.equal(writes[0].data?.status, 'NEEDS_TIMING', 'tempos marcados contra outro arquivo: volta a conferir');
  assert.equal(writes[0].data?.readyAt, null);
  assert.deepEqual(out.pending, ['CONFIRM']);

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
