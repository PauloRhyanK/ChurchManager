import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WorshipRow,
  deriveSong,
  holyricsText,
  normalizeRows,
  songPending,
  songStatus,
} from './worship-document';

const AUDIO = { url: 'https://cdn/x.mp3', durationSeconds: 100 };
const SEM_AUDIO = { url: null, durationSeconds: null };

function song(times: (number | null)[] = [1, 2, 3]): WorshipRow[] {
  return [
    { id: 'a', type: 'cue', target: 'VOCAL', text: 'solo', part: { kind: 'VERSE', mood: 'WORSHIP' }, time: times[0] },
    { id: 'b', type: 'lyric', text: 'Antes do sol nascer' },
    { id: 'c', type: 'break' },
    { id: 'd', type: 'lyric', text: 'Tua voz me chamou', time: times[1] },
    { id: 'e', type: 'lyric', text: 'És a luz da manhã', part: { kind: 'CHORUS', mood: 'CELEBRATION' }, time: times[2] },
  ];
}

test('deriveSong: partes, slides, nomes e tempo da parte', () => {
  const { parts, slides } = deriveSong(song());
  assert.deepEqual(parts.map((p) => [p.name, p.firstSlide, p.slideCount, p.time]), [['Verso 1', 0, 2, 1], ['Refrão', 2, 1, 3]]);
  assert.deepEqual(slides.map((s) => [s.part, s.rowId, s.time, s.lines]), [
    [0, 'a', 1, ['ANTES DO SOL NASCER']],
    [0, 'd', 2, ['TUA VOZ ME CHAMOU']],
    [1, 'e', 3, ['ÉS A LUZ DA MANHÃ']],
  ]);
  assert.deepEqual(slides[0].cues, [{ target: 'VOCAL', text: 'solo' }]);
});

test('slide só com instrução é válido (telão vazio)', () => {
  const { slides, parts } = deriveSong([{ id: 'i', type: 'cue', target: 'ALL', text: 'Intro', part: { kind: 'INTRO', mood: null } }]);
  assert.equal(slides.length, 1);
  assert.deepEqual(slides[0].lines, []);
  assert.equal(parts[0].name, 'Intro');
});

test('documento vazio: nada derivado e situação Rascunho', () => {
  assert.deepEqual(deriveSong([]), { parts: [], slides: [] });
  assert.deepEqual(songStatus([], AUDIO, new Date()), { status: 'DRAFT', pending: [], slideCount: 0 });
  assert.deepEqual(songStatus([{ id: 'x', type: 'break' }], AUDIO, null).status, 'DRAFT');
});

test('pendências: áudio, tempos e climas', () => {
  assert.deepEqual(songPending(song(), SEM_AUDIO), ['AUDIO']);
  assert.deepEqual(songPending(song([1, null, 3]), AUDIO), ['TIMES']);
  assert.deepEqual(songPending(song([1, 5, 3]), AUDIO), ['TIMES'], 'fora de ordem');
  assert.deepEqual(songPending(song([1, 1, 3]), AUDIO), ['TIMES'], 'tempos iguais');
  assert.deepEqual(songPending(song([1, 2, 101]), AUDIO), ['TIMES'], 'além do fim do áudio');
  const semClima = song();
  semClima[4].part = { kind: 'CHORUS', mood: null };
  assert.deepEqual(songPending(semClima, SEM_AUDIO), ['AUDIO', 'MOODS']);
});

test('situação: completa sem marcar falta só confirmar; marcada fica Pronta', () => {
  assert.deepEqual(songStatus(song(), AUDIO, null), { status: 'NEEDS_TIMING', pending: ['CONFIRM'], slideCount: 3 });
  assert.equal(songStatus(song(), AUDIO, new Date()).status, 'READY');
  assert.equal(songStatus(song([1, null, 3]), AUDIO, new Date()).status, 'NEEDS_TIMING');
});

test('normalizeRows: forma canônica', () => {
  const out = normalizeRows([
    { id: 'z', type: 'break' },
    { id: 'a', type: 'lyric', text: '  Linha   um ', time: 1.239 },
    { id: 'a', type: 'lyric', text: 'Linha dois', time: 9 },
    { id: 'b', type: 'lyric', text: '   ', part: { kind: 'CHORUS', mood: 'BUILD' } },
    { id: 'c', type: 'break' },
    { id: 'd', type: 'lyric', text: 'Refrão aqui', time: -4 },
    { id: 'e', type: 'break' },
  ]);
  assert.deepEqual(out.map((r) => r.type), ['lyric', 'lyric', 'lyric']);
  assert.deepEqual(out[0], { id: 'a', type: 'lyric', text: 'Linha um', part: { kind: 'VERSE', mood: null }, time: 1.24, timeSource: 'MANUAL' });
  assert.notEqual(out[1].id, 'a', 'id repetido ganha id novo');
  assert.equal(out[1].time, undefined, 'tempo fora do começo do slide é limpo');
  assert.deepEqual(out[2].part, { kind: 'CHORUS', mood: 'BUILD' }, 'a parte da linha apagada passa para a seguinte');
  assert.equal(out[2].time, 0, 'tempo negativo vira zero');
});

test('normalizeRows: linha apagada passa parte e tempo adiante; com duas, vale a última (como na tela)', () => {
  const rows: WorshipRow[] = [
    { id: 'a', type: 'lyric', text: 'um', part: { kind: 'VERSE', mood: null }, time: 1 },
    { id: 'b', type: 'break', part: { kind: 'CHORUS', mood: null }, time: 5 },
    { id: 'c', type: 'break', part: { kind: 'BRIDGE', mood: 'BUILD' }, time: 7 },
    { id: 'd', type: 'lyric', text: 'dois' },
  ];
  const out = normalizeRows(rows);
  assert.deepEqual(out[1], { id: 'd', type: 'lyric', text: 'dois', part: { kind: 'BRIDGE', mood: 'BUILD' }, time: 7, timeSource: 'MANUAL' });
  assert.deepEqual(deriveSong(rows).parts.map((p) => p.kind), deriveSong(out).parts.map((p) => p.kind));
});

test('normalizeRows é idempotente', () => {
  const once = normalizeRows(song());
  assert.deepEqual(normalizeRows(once), once);
});

test('holyricsText: recado com // antes das linhas em maiúsculas', () => {
  assert.equal(
    holyricsText(song()),
    '//Vocal: solo\nANTES DO SOL NASCER\n\nTUA VOZ ME CHAMOU\n\nÉS A LUZ DA MANHÃ',
  );
});
