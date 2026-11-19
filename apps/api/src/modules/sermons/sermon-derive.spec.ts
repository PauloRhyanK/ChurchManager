import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_DOC, Inner, SermonBlock, SermonDoc } from './sermon-document';
import { SPEECH_PACE, countWords, deriveSermon, normalizeSearch } from './sermon-derive';
import { EXAMPLE_DERIVED, EXAMPLE_DOC } from './sermon-example';

const words = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).join(' ');
const para = (text: string): Inner => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content: SermonBlock[]): SermonDoc => ({ type: 'doc', content });
const point = (id: string, text: string): SermonBlock => ({ type: 'point', attrs: { id }, content: [{ type: 'text', text }] });
const heading = (id: string, level: 2 | 3, text: string): SermonBlock => ({
  type: 'heading',
  attrs: { id, level },
  content: [{ type: 'text', text }],
});
const box = (type: 'illustration' | 'application' | 'privateNote', id: string, text: string): SermonBlock => ({
  type,
  attrs: { id },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const verse = (id: string, reference: string, ...texts: string[]): SermonBlock => ({
  type: 'verse',
  attrs: {
    id,
    reference,
    book: null,
    chapter: null,
    verseStart: null,
    verseEnd: null,
    translation: null,
    verses: texts.map((text, i) => ({ number: i + 1, text })),
  },
});

test('ritmo de fala', () => {
  assert.deepEqual(SPEECH_PACE, { wordsPerMinute: 130, pointSeconds: 60, illustrationSeconds: 90, applicationSeconds: 60 });
});

test('(a) 130 palavras num parágrafo: uma Abertura de 60 s', () => {
  const d = deriveSermon(doc(para(words(130))));
  assert.deepEqual(d.sections, [{ id: null, kind: 'OPENING', title: 'Abertura', number: null, seconds: 60, minutes: 1 }]);
  assert.equal(d.estimatedSeconds, 60);
});

test('(b) Ponto soma 60 s de folga em si mesmo', () => {
  const d = deriveSermon(doc(point('pt1', 'A luz chama'), para(words(127))));
  assert.deepEqual(d.sections, [{ id: 'pt1', kind: 'POINT', title: 'A luz chama', number: 1, seconds: 120, minutes: 2 }]);
  assert.equal(d.pointCount, 1);
  assert.equal(d.estimatedSeconds, 120);
});

test('(c) ilustração soma 90 s e aplicação 60 s além das palavras', () => {
  const d = deriveSermon(doc(box('illustration', 'i1', words(130)), box('application', 'a1', words(130))));
  assert.equal(d.sections[0].seconds, 60 + 90 + 60 + 60);
});

test('(d) nota "só para mim" não conta', () => {
  const base = deriveSermon(doc(para(words(130))));
  const com = deriveSermon(doc(para(words(130)), box('privateNote', 'n1', words(500))));
  assert.deepEqual(com, base);
});

test('(e) versículo com dois textos conta as palavras dos dois; a referência não conta', () => {
  const d = deriveSermon(doc(verse('v1', 'João 8:12', words(60), words(70))));
  assert.equal(d.sections[0].seconds, 60);
});

test('(f) título 2 abre seção sem número; título 3 não abre', () => {
  const d = deriveSermon(
    doc(point('p1', 'Um'), para(words(10)), heading('h1', 2, 'Conclusão'), para(words(13)), heading('h2', 3, 'Detalhe'), para(words(13))),
  );
  assert.deepEqual(
    d.sections.map((s) => [s.id, s.kind, s.title, s.number]),
    [
      ['p1', 'POINT', 'Um', 1],
      ['h1', 'HEADING', 'Conclusão', null],
    ],
  );
  // Conclusão: 1 + 13 + 1 + 13 palavras = 28 (título 3 fica na mesma seção)
  assert.equal(d.sections[1].seconds, Math.round((28 / 130) * 60));
});

test('(g) versículos sem repetir; referência base; verseRefs normalizado', () => {
  const d = deriveSermon(doc(verse('a', 'João 8:12', 'x'), verse('b', 'Salmos 119:105', 'y'), verse('c', 'João 8:12', 'z')));
  assert.deepEqual(d.verses, [
    { id: 'a', reference: 'João 8:12' },
    { id: 'b', reference: 'Salmos 119:105' },
  ]);
  assert.equal(d.baseReference, 'João 8:12');
  assert.equal(d.verseRefs, 'joao 8:12\nsalmos 119:105');
});

test('(h) EMPTY_DOC, content vazio e só nota privada derivam vazio', () => {
  const vazio = { sections: [], verses: [], baseReference: null, pointCount: 0, verseRefs: '', estimatedSeconds: 0 };
  assert.deepEqual(deriveSermon(EMPTY_DOC), vazio);
  assert.deepEqual(deriveSermon({ type: 'doc', content: [] }), vazio);
  assert.deepEqual(deriveSermon(doc(box('privateNote', 'n', words(500)))), vazio);
});

test('(i) seção curta tem pelo menos 1 minuto', () => {
  const s = deriveSermon(doc(para('um dois três quatro cinco'))).sections[0];
  assert.equal(s.seconds, 2);
  assert.equal(s.minutes, 1);
});

test('Abertura só com ilustração existe; nota privada antes do primeiro Ponto não cria Abertura', () => {
  assert.equal(deriveSermon(doc(box('illustration', 'i', 'oi'))).sections[0].kind, 'OPENING');
  const d = deriveSermon(doc(box('privateNote', 'n', 'oi'), point('p', 'Um')));
  assert.deepEqual(d.sections.map((s) => s.kind), ['POINT']);
});

test('listas, marcas e quebra de linha contam palavras; pontuação solta não', () => {
  const lista: SermonBlock = {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [para('um dois')] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'três', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }, { type: 'text', text: '-' }] }] },
    ],
  };
  const d = deriveSermon(doc(lista));
  assert.equal(d.sections[0].seconds, Math.round((3 / 130) * 60));
});

test('normalizeSearch e countWords', () => {
  assert.equal(normalizeSearch('  João   8:12 '), 'joao 8:12');
  assert.equal(normalizeSearch('LÂMPADA'), 'lampada');
  assert.equal(countWords('a — b  c1 !'), 3);
  assert.equal(countWords(''), 0);
});

test('(j) o documento de exemplo deriva no EXAMPLE_DERIVED', () => {
  assert.deepEqual(deriveSermon(EXAMPLE_DOC), EXAMPLE_DERIVED);
});
