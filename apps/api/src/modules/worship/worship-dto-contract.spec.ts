import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import { CreateServiceDto, SetMomentsDto, SetSongsDto } from './dto/service.dto';
import { CreateSongDto, UpdateSongDto, UploadAudioDto } from './dto/song.dto';
import { ImportYoutubeDto, SearchYoutubeQueryDto } from './dto/youtube.dto';

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function parse<T>(metatype: Type<T>, body: unknown): Promise<T> {
  return (await pipe.transform(body, { type: 'body', metatype })) as T;
}
async function rejects(metatype: Type<unknown>, body: unknown) {
  await assert.rejects(parse(metatype, body), BadRequestException);
}

const ROWS = [
  { id: 'a', type: 'cue', target: 'VOCAL', text: 'solo', part: { kind: 'VERSE', mood: null }, time: null },
  { id: 'b', type: 'lyric', text: 'Antes do sol nascer' },
  { id: 'c', type: 'break' },
  { id: 'd', type: 'lyric', text: 'És a luz', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: 12.5, timeSource: 'MANUAL' },
];

test('UpdateSongDto aceita o documento e preserva null (sem tempo, sem clima)', async () => {
  const dto = await parse(UpdateSongDto, { title: ' Luz ', bpm: 72, rows: ROWS });
  assert.equal(dto.title, 'Luz');
  assert.equal(dto.rows?.length, 4);
  assert.equal(dto.rows?.[0].time, null, 'null não pode virar 0');
  assert.equal(dto.rows?.[0].part?.mood, null);
  assert.equal(dto.rows?.[3].time, 12.5);
});

test('UpdateSongDto: vínculo com o Holyrics é texto livre curto; vazio vira null', async () => {
  assert.equal((await parse(UpdateSongDto, { holyricsId: ' 1741522267781 ' })).holyricsId, '1741522267781');
  assert.equal((await parse(UpdateSongDto, { holyricsId: '' })).holyricsId, null);
  await rejects(UpdateSongDto, { holyricsId: 'x'.repeat(65) });
});

test('UpdateSongDto recusa campos que o servidor devolve', async () => {
  for (const extra of [
    { status: 'READY' },
    { pending: [] },
    { audioUrl: 'https://x/y.mp3' },
    { audio: { url: 'https://x/y.mp3' } },
    { tenantId: '22222222-2222-4222-8222-222222222222' },
    { readyAt: '2026-01-01T00:00:00.000Z' },
    { id: '11111111-1111-4111-8111-111111111111' },
    { slideCount: 3 },
  ]) {
    await rejects(UpdateSongDto, { title: 'Luz', ...extra });
  }
});

test('UpdateSongDto valida cada linha', async () => {
  const bad = (row: Record<string, unknown>) => rejects(UpdateSongDto, { rows: [row] });
  await bad({ id: 'a', type: 'verso', text: 'x' });
  await bad({ id: '', type: 'lyric', text: 'x' });
  await bad({ type: 'lyric', text: 'x' });
  await bad({ id: 'a', type: 'lyric', text: 'x'.repeat(201) });
  await bad({ id: 'a', type: 'cue', target: 'TROMBONE', text: 'x' });
  await bad({ id: 'a', type: 'lyric', text: 'x', part: { kind: 'SOLO', mood: null } });
  await bad({ id: 'a', type: 'lyric', text: 'x', part: { kind: 'VERSE', mood: 'TRISTE' } });
  await bad({ id: 'a', type: 'lyric', text: 'x', time: -1 });
  await bad({ id: 'a', type: 'lyric', text: 'x', time: 3601 });
  await bad({ id: 'a', type: 'lyric', text: 'x', time: '12' });
  await bad({ id: 'a', type: 'lyric', text: 'x', tenantId: 'z' });
  await rejects(UpdateSongDto, { rows: Array.from({ length: 601 }, (_, i) => ({ id: `r${i}`, type: 'break' })) });
  await rejects(UpdateSongDto, { rows: 'texto' });
  await rejects(UpdateSongDto, { bpm: 10 });
  await rejects(UpdateSongDto, { title: '   ' });
});

test('CreateSongDto: título obrigatório; organize só booleano; aceita audio opcional', async () => {
  const dto = await parse(CreateSongDto, {
    title: 'Nova',
    rawLyrics: 'a\nb',
    organize: true,
    audio: { url: 'https://cdn/x.mp3', fileName: 'x.mp3', durationSeconds: 60, sizeBytes: 100 },
  });
  assert.equal(dto.organize, true);
  assert.equal(dto.audio?.url, 'https://cdn/x.mp3');
  assert.equal(dto.audio?.durationSeconds, 60);
  await rejects(CreateSongDto, { rawLyrics: 'a' });
  await rejects(CreateSongDto, { title: 'x', rows: [] });
  await rejects(CreateSongDto, { title: 'x', rawLyrics: 'a'.repeat(20_001) });
  await rejects(CreateSongDto, { title: 'x', audio: { url: 'not-a-url' } });
});

test('UploadAudioDto converte a duração que chega como texto no multipart', async () => {
  const dto = await parse(UploadAudioDto, { durationSeconds: '252.4', fileName: 'luz.mp3' });
  assert.equal(dto.durationSeconds, 252.4);
  await rejects(UploadAudioDto, { durationSeconds: 'abc' });
  await rejects(UploadAudioDto, { audioUrl: 'https://x' });
});

test('YouTube DTOs: validações de busca e importação', async () => {
  const search = await parse(SearchYoutubeQueryDto, { q: '  Gratidão  ' });
  assert.equal(search.q, 'Gratidão');
  await rejects(SearchYoutubeQueryDto, { q: '   ' });

  const imp = await parse(ImportYoutubeDto, { urlOrId: '  https://youtu.be/abc  ' });
  assert.equal(imp.urlOrId, 'https://youtu.be/abc');
  await rejects(ImportYoutubeDto, { urlOrId: '   ' });
});

test('roteiro: data, hora, momentos e músicas', async () => {
  await parse(CreateServiceDto, { date: '2026-11-22', startTime: '19:00' });
  await rejects(CreateServiceDto, { date: '22/11/2026' });
  await rejects(CreateServiceDto, { date: '2026-11-22', startTime: '25:00' });
  await rejects(CreateServiceDto, { date: '2026-11-22', tenantId: 'x' });
  await parse(SetMomentsDto, { moments: [{ name: 'Louvor', kind: 'WORSHIP', durationMinutes: 17 }] });
  await rejects(SetMomentsDto, { moments: [{ name: 'Louvor', kind: 'SHOW', durationMinutes: 17 }] });
  await rejects(SetMomentsDto, { moments: [{ name: '', kind: 'GENERIC', durationMinutes: 5 }] });
  await rejects(SetMomentsDto, { moments: [{ name: 'x', kind: 'GENERIC', durationMinutes: 0 }] });
  await rejects(SetMomentsDto, { moments: [{ name: 'x', kind: 'GENERIC', durationMinutes: 5, startsAt: '19:00' }] });
  await parse(SetSongsDto, { songIds: ['11111111-1111-4111-8111-111111111111'] });
  await rejects(SetSongsDto, { songIds: ['abc'] });
});

test('UpdateSongDto: a parte aceita nome próprio curto', async () => {
  const dto = await parse(UpdateSongDto, { rows: [{ id: 'a', type: 'lyric', text: 'x', part: { kind: 'CHORUS', mood: null, name: 'Refrão final' } }] });
  assert.equal(dto.rows?.[0].part?.name, 'Refrão final');
  await rejects(UpdateSongDto, { rows: [{ id: 'a', type: 'lyric', text: 'x', part: { kind: 'CHORUS', mood: null, name: 'x'.repeat(41) } }] });
  await rejects(UpdateSongDto, { rows: [{ id: 'a', type: 'lyric', text: 'x', part: { kind: 'CHORUS', mood: null, name: 7 } }] });
});
