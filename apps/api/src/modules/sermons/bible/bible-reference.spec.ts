import assert from 'node:assert/strict';
import test from 'node:test';
import { BIBLE_BOOKS, bookByNumber, bookByVplCode } from './bible-books';
import { formatReference, normalizeBibleText, parseReference } from './bible-reference';

const ref = (book: number, chapter: number, verseStart: number | null, verseEnd: number | null) => ({ book, chapter, verseStart, verseEnd });

test('tabela: 66 livros em ordem, 1189 capítulos, códigos únicos', () => {
  assert.equal(BIBLE_BOOKS.length, 66);
  BIBLE_BOOKS.forEach((b, i) => assert.equal(b.number, i + 1));
  assert.equal(BIBLE_BOOKS.reduce((s, b) => s + b.chapters, 0), 1189);
  assert.equal(new Set(BIBLE_BOOKS.map((b) => b.vpl)).size, 66);
  assert.equal(bookByNumber(19)?.name, 'Salmos');
  assert.equal(bookByNumber(67), undefined);
  assert.equal(bookByVplCode('rev')?.number, 66);
  assert.equal(bookByVplCode('XXX'), undefined);
});

test('tabela: nenhum alias repetido entre livros', () => {
  const seen = new Map<string, number>();
  for (const b of BIBLE_BOOKS) for (const a of b.aliases) {
    assert.equal(seen.has(a), false, `alias repetido: ${a} (${seen.get(a)} e ${b.number})`);
    seen.set(a, b.number);
  }
  assert.equal(seen.get('jo'), 43);
  assert.equal(seen.get('job'), 18);
});

test('normalizeBibleText', () => {
  assert.equal(normalizeBibleText('  João   3:16 '), 'joao 3:16');
});

test('formas de escrever Mateus 5:14', () => {
  for (const t of ['mt 5 14', 'mt 5:14', 'Mateus 5.14', 'MT 5,14']) assert.deepEqual(parseReference(t), ref(40, 5, 14, 14), t);
});

test('1 Coríntios 13:4-7 em várias grafias', () => {
  for (const t of ['1co 13 4-7', '1 co 13:4-7', '1co13 4-7', 'i co 13 4 – 7', '1ª coríntios 13:4-7']) assert.deepEqual(parseReference(t), ref(46, 13, 4, 7), t);
});

test('só capítulo', () => {
  assert.deepEqual(parseReference('sl 23'), ref(19, 23, null, null));
});

test('João, Jó e livros numerados', () => {
  assert.equal(parseReference('joao 3 16')?.book, 43);
  assert.equal(parseReference('João 3:16')?.book, 43);
  assert.equal(parseReference('jo 3 16')?.book, 43);
  assert.equal(parseReference('jó 3 16')?.book, 18);
  assert.equal(parseReference('Jó 3 16')?.book, 18);
  assert.equal(parseReference('job 3 16')?.book, 18);
  assert.deepEqual(parseReference('3jo 1 4'), ref(64, 1, 4, 4));
  assert.deepEqual(parseReference('ap 22 21'), ref(66, 22, 21, 21));
  assert.equal(parseReference('is 5 1')?.book, 23);
});

test('livro de um capítulo: número isolado é versículo', () => {
  assert.deepEqual(parseReference('jd 3'), ref(65, 1, 3, 3));
  assert.deepEqual(parseReference('jd 1 3'), ref(65, 1, 3, 3));
  assert.deepEqual(parseReference('jd 3-5'), ref(65, 1, 3, 5));
  assert.equal(parseReference('jd 2 3'), null);
});

test('entradas inválidas', () => {
  for (const t of ['amor 13', 'luz do mundo', 'mt', 'mt 5 14 abc', 'mt 0', 'mt 29', 'mt 5 0', 'mt 5 16-14', '']) assert.equal(parseReference(t), null, t);
});

test('formatReference', () => {
  assert.equal(formatReference(ref(40, 5, 14, 14)), 'Mateus 5:14');
  assert.equal(formatReference(ref(40, 5, 14, 16)), 'Mateus 5:14-16');
  assert.equal(formatReference(ref(19, 23, null, null)), 'Salmos 23');
});
