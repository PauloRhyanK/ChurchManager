import assert from 'node:assert/strict';
import test from 'node:test';
import { BIBLE_BOOKS } from './bible-books';
import { assertCanon, parseVpl, type VplVerse } from './bible-vpl';

test('parseVpl: lê versículos e remove o marcador de acróstico', () => {
  const content = [
    'GEN 1:1 No princípio criou Deus os céus e a terra.',
    '',
    'PSA 119:105 [Nun] :Tua palavra é lâmpada para meus pés.',
    'JOH 3:16  Porque Deus amou o mundo.  ',
  ].join('\n');
  assert.deepEqual(parseVpl(content), [
    { book: 1, chapter: 1, verse: 1, text: 'No princípio criou Deus os céus e a terra.' },
    { book: 19, chapter: 119, verse: 105, text: 'Tua palavra é lâmpada para meus pés.' },
    { book: 43, chapter: 3, verse: 16, text: 'Porque Deus amou o mundo.' },
  ]);
});

test('parseVpl: colchetes que não são letra de acróstico ficam no texto', () => {
  const [a, b] = parseVpl('SOL 2:2 [Ele] : Como um lírio.\nEST 8:16 [E] para os judeus houve luz.');
  assert.equal(a.text, '[Ele] : Como um lírio.');
  assert.equal(b.text, '[E] para os judeus houve luz.');
});

test('parseVpl: aceita BOM e CRLF', () => {
  const out = parseVpl('\uFEFFGEN 1:1 Um.\r\nGEN 1:2 Dois.\r\n');
  assert.equal(out.length, 2);
  assert.equal(out[0].text, 'Um.');
  assert.equal(out[1].text, 'Dois.');
});

test('parseVpl: código desconhecido cita a linha', () => {
  assert.throws(() => parseVpl('GEN 1:1 a\nXXX 1:1 a'), /[Ll]inha 2/);
});

test('parseVpl: linha sem referência cita a linha', () => {
  assert.throws(() => parseVpl('GEN 1:1 a\n\nlinha solta'), /[Ll]inha 3/);
});

test('parseVpl: texto vazio depois do marcador é erro', () => {
  assert.throws(() => parseVpl('PSA 119:1 [Álefe] :'), /[Ll]inha 1/);
});

test('parseVpl: versículo repetido é erro', () => {
  assert.throws(() => parseVpl('GEN 1:1 a\nGEN 1:1 b'), /[Ll]inha 2/);
});

function canonSet(): VplVerse[] {
  return BIBLE_BOOKS.flatMap((b) =>
    Array.from({ length: b.chapters }, (_, i) => ({ book: b.number, chapter: i + 1, verse: 1, text: 'x' })),
  );
}

test('assertCanon: um versículo por capítulo de cada livro passa', () => {
  assert.doesNotThrow(() => assertCanon(canonSet()));
});

test('assertCanon: livro faltando falha citando o livro', () => {
  const set = canonSet().filter((v) => v.book !== 19);
  assert.throws(() => assertCanon(set), /Salmos/);
});

test('assertCanon: capítulo faltando falha citando o livro', () => {
  const set = canonSet().filter((v) => !(v.book === 43 && v.chapter === 21));
  assert.throws(() => assertCanon(set), /João/);
});

test('parseVpl: capítulo ou versículo com mais de três dígitos é erro com o número da linha', () => {
  assert.throws(() => parseVpl('GEN 1:1 a\nGEN 1000:1 a'), /[Ll]inha 2/);
  assert.throws(() => parseVpl('GEN 1:1 a\nGEN 1:2 b\nGEN 1:1234 a'), /[Ll]inha 3/);
  assert.equal(parseVpl('PSA 119:176 a')[0].verse, 176);
});
