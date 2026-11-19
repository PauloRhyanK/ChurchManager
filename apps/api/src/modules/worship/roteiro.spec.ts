import assert from 'node:assert/strict';
import test from 'node:test';
import { placeSongs, songMinutes, songMood, songParts, type RoteiroDraft } from './roteiro';
import type { WorshipRow } from './worship-document';

const m = (name: string, kind: RoteiroDraft['kind'], songId: string | null = null): RoteiroDraft => ({ id: name, name, kind, durationMinutes: 5, songId });
const novo = (songId: string): RoteiroDraft => ({ name: songId, kind: 'SONG', durationMinutes: 5, songId });
const view = (list: RoteiroDraft[]) => list.map((x) => (x.kind === 'SONG' ? `♪${x.songId ?? '_'}` : x.name));

test('só as músicas: reordenar troca as músicas de lugar sem mexer nos momentos', () => {
  const roteiro = [m('Abertura', 'GENERIC'), m('a', 'SONG', 'A'), m('Oração', 'GENERIC'), m('b', 'SONG', 'B')];
  assert.deepEqual(view(placeSongs(roteiro, ['B', 'A'], novo)), ['Abertura', '♪B', 'Oração', '♪A']);
});

test('tirar uma música tira o lugar dela; acrescentar vai logo depois da última música', () => {
  const roteiro = [m('a', 'SONG', 'A'), m('Oração', 'GENERIC'), m('b', 'SONG', 'B'), m('Avisos', 'GENERIC')];
  assert.deepEqual(view(placeSongs(roteiro, ['A'], novo)), ['♪A', 'Oração', 'Avisos']);
  assert.deepEqual(view(placeSongs(roteiro, ['A', 'B', 'C'], novo)), ['♪A', 'Oração', '♪B', '♪C', 'Avisos']);
});

test('espaço reservado vazio é preenchido antes; sem música nenhuma, o bloco Louvor dá lugar às músicas', () => {
  const comEspaco = [m('Abertura', 'GENERIC'), m('x', 'SONG'), m('Oração', 'GENERIC'), m('y', 'SONG')];
  assert.deepEqual(view(placeSongs(comEspaco, ['A'], novo)), ['Abertura', '♪A', 'Oração', '♪_']);
  const comLouvor = [m('Abertura', 'GENERIC'), m('Louvor', 'WORSHIP'), m('Palavra', 'SERMON')];
  assert.deepEqual(view(placeSongs(comLouvor, ['A', 'B'], novo)), ['Abertura', '♪A', '♪B', 'Palavra']);
  assert.deepEqual(view(placeSongs([m('Palavra', 'SERMON')], ['A'], novo)), ['Palavra', '♪A']);
});

test('clima da música: o que mais aparece; no empate, o mais forte. Partes com início e fim', () => {
  const rows: WorshipRow[] = [
    { id: 'a', type: 'lyric', text: 'um', part: { kind: 'VERSE', mood: 'WORSHIP' }, time: 10 },
    { id: 'b', type: 'lyric', text: 'dois', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: 30 },
    { id: 'c', type: 'lyric', text: 'três', part: { kind: 'VERSE', mood: 'WORSHIP' }, time: 50 },
    { id: 'd', type: 'lyric', text: 'quatro', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: null },
  ];
  assert.equal(songMood(rows), 'CELEBRATION');
  assert.equal(songMood([]), null);
  assert.deepEqual(songParts(rows, 90), [
    { indice: 0, nome: 'Verso 1', kind: 'VERSE', inicioSeg: 10, fimSeg: 30 },
    { indice: 1, nome: 'Refrão', kind: 'CHORUS', inicioSeg: 30, fimSeg: 50 },
    { indice: 2, nome: 'Verso 2', kind: 'VERSE', inicioSeg: 50, fimSeg: 90 },
    { indice: 3, nome: 'Refrão', kind: 'CHORUS', inicioSeg: null, fimSeg: null },
  ]);
  assert.equal(songMinutes(250), 5);
  assert.equal(songMinutes(null), 5);
  assert.equal(songMinutes(100), 2);
});
