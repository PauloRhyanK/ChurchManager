import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../../validation-options';
import { BibleService, PrismaBibleSource, type BibleSource } from './bible.service';
import { BibleSearchQuery } from './dto/bible.dto';

type V = { book: number; chapter: number; verse: number; text: string };
const TR = { code: 'ARA', name: 'Almeida', shortName: 'ARA', attribution: 'a', license: 'l', isDefault: true };
const OTHER = { code: 'XYZ', name: 'Outra', shortName: 'XYZ', attribution: 'a', license: 'l', isDefault: false };

const DATA: V[] = [
  { book: 40, chapter: 5, verse: 13, text: 'Vós sois o sal da terra.' },
  { book: 40, chapter: 5, verse: 14, text: 'Vós sois a luz do mundo.' },
  { book: 40, chapter: 5, verse: 15, text: 'Nem se acende uma candeia.' },
  { book: 40, chapter: 5, verse: 16, text: 'Assim brilhe a vossa luz.' },
  { book: 43, chapter: 3, verse: 16, text: 'Porque Deus amou o mundo.' },
  { book: 43, chapter: 3, verse: 17, text: 'Porque Deus enviou o Filho.' },
  { book: 43, chapter: 8, verse: 12, text: 'Eu sou a luz do mundo.' },
  ...[1, 2, 3, 4, 5, 6].map((verse) => ({ book: 19, chapter: 23, verse, text: `Salmo ${verse}` })),
];

/** Espelha a ordenação do SQL: frase exata (sem pontuação) primeiro. */
function phrase(text: string, words: string[]): number {
  const plain = ` ${text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/ +/g, ' ')} `;
  return plain.includes(` ${words.join(' ')} `) ? 1 : 0;
}

function memory(translations = [TR], data = DATA): BibleSource & { calls: string[] } {
  const calls: string[] = [];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return {
    calls,
    async translations() {
      return translations;
    },
    async lookup(translation, book, chapter, start, end) {
      calls.push(translation);
      return data
        .filter((v) => v.book === book && v.chapter === chapter && (start === null || (v.verse >= start && v.verse <= (end ?? start))))
        .sort((a, b) => a.verse - b.verse)
        .map((v) => ({ number: v.verse, text: v.text }));
    },
    async searchText(translation, words, limit) {
      calls.push(translation);
      return data
        .filter((v) => words.every((w) => norm(v.text).includes(w)))
        .sort((a, b) => phrase(b.text, words) - phrase(a.text, words) || a.book - b.book || a.chapter - b.chapter || a.verse - b.verse)
        .slice(0, limit)
        .map(({ book, chapter, verse, text }) => ({ book, chapter, verse, text }));
    },
  };
}
const svc = (src = memory()) => new BibleService(src);

test('um versículo devolve ele, o trecho de até três e o seguinte', async () => {
  const r = await svc().search('mt 5 14');
  assert.equal(r.mode, 'REFERENCE');
  assert.deepEqual(r.hits.map((h) => h.reference), ['Mateus 5:14', 'Mateus 5:14-16', 'Mateus 5:15']);
  assert.equal(r.hits[0].hint, null);
  assert.equal(r.hits[1].hint, 'Três versículos · do 14 ao 16');
  assert.equal(r.hits[1].verses.length, 3);
  assert.equal(r.hits[2].verses[0].text, 'Nem se acende uma candeia.');
  assert.equal(r.hits[0].translation, 'ARA');
});

test('com só um versículo adiante o trecho é de dois', async () => {
  const r = await svc().search('mt 5 15');
  assert.equal(r.hits[1].hint, 'Dois versículos · do 15 ao 16');
  assert.equal(r.hits[1].verseEnd, 16);
  assert.equal(r.hits.length, 3);
});

test('último versículo do capítulo devolve só ele', async () => {
  const r = await svc().search('mt 5 16');
  assert.deepEqual(r.hits.map((h) => h.reference), ['Mateus 5:16']);
});

test('capítulo inteiro vira um hit com a dica', async () => {
  const r = await svc().search('sl 23');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].verses.length, 6);
  assert.equal(r.hits[0].hint, 'Capítulo inteiro · 6 versículos');
  assert.equal(r.hits[0].reference, 'Salmos 23');
});

test('intervalo é cortado no último versículo que existe', async () => {
  const r = await svc().search('mt 5 14-99');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].verseEnd, 16);
  assert.equal(r.hits[0].reference, 'Mateus 5:14-16');
  assert.equal(r.hits[0].hint, null);
});

test('referência que não existe no banco é NONE', async () => {
  assert.deepEqual(await svc().search('mt 99'), { mode: 'NONE', hits: [] });
  assert.deepEqual(await svc().search('jo 3 999'), { mode: 'NONE', hits: [] });
});

test('busca por trecho exige todas as palavras e ordena pelos livros', async () => {
  const r = await svc().search('luz do mundo');
  assert.equal(r.mode, 'TEXT');
  assert.deepEqual(r.hits.map((h) => h.reference), ['Mateus 5:14', 'João 8:12']);
  assert.equal(r.hits[0].verseStart, 14);
  assert.deepEqual(await svc().search('Luz  MUNDO'), r);
});

test('pontuação na consulta é ignorada e palavra de um caractere cai', async () => {
  const ref = (await svc().search('luz do mundo')).hits.map((h) => h.reference);
  assert.deepEqual(ref, ['Mateus 5:14', 'João 8:12']);
  for (const q of ['luz, do mundo', 'luz do mundo!', '"luz" (do) mundo?', 'luz do mundo -']) {
    assert.deepEqual((await svc().search(q)).hits.map((h) => h.reference), ref, q);
  }
  assert.deepEqual((await svc().search('?? ... !!')).mode, 'NONE');
  assert.deepEqual(await svc().search('a ? b'), { mode: 'NONE', hits: [] });
});

test('frase exata vem antes das palavras espalhadas, cada grupo na ordem dos livros', async () => {
  const data = [
    { book: 1, chapter: 1, verse: 1, text: 'A luz brilha do alto sobre o mundo.' },
    ...DATA,
    { book: 66, chapter: 1, verse: 1, text: 'Luz, do mundo!' },
  ];
  const r = await svc(memory([TR], data)).search('luz do mundo');
  assert.deepEqual(r.hits.map((h) => h.reference), ['Mateus 5:14', 'João 8:12', 'Apocalipse 1:1', 'Gênesis 1:1']);
});

test('consulta patológica não trava e referência inválida continua NONE', async () => {
  for (const q of ['a ' + '1'.repeat(110) + 'x', 'mt ' + '1'.repeat(110), 'a ' + '1 '.repeat(55) + 'x']) {
    const t0 = performance.now();
    await svc().search(q);
    assert.ok(performance.now() - t0 < 200, `demorou demais: ${q.slice(0, 12)}`);
  }
  assert.deepEqual(await svc().search('mt 99'), { mode: 'NONE', hits: [] });
  assert.deepEqual(await svc().search('jo 3 999'), { mode: 'NONE', hits: [] });
  assert.equal((await svc().search('luz 1')).mode, 'TEXT');
});

test('hífen dentro da palavra separa em duas palavras', async () => {
  const seen: string[][] = [];
  const src = memory();
  const orig = src.searchText;
  src.searchText = async (t, w, l) => (seen.push(w), orig(t, w, l));
  await svc(src).search('disse-lhe Jesus');
  await svc(src).search('luz, do mundo');
  assert.deepEqual(seen[0], ['disse', 'lhe', 'jesus']);
  assert.deepEqual(seen[1], ['luz', 'do', 'mundo']);
});

test('trecho curto demais é NONE e sem resultado é TEXT vazio', async () => {
  assert.deepEqual(await svc().search('ab'), { mode: 'NONE', hits: [] });
  assert.deepEqual(await svc().search('   '), { mode: 'NONE', hits: [] });
  assert.deepEqual(await svc().search('zzzqqq'), { mode: 'TEXT', hits: [] });
});

test('tradução desconhecida cai na padrão; pedida existente é usada; sem tradução é NONE', async () => {
  const src = memory([OTHER, TR]);
  await svc(src).search('mt 5 14', 'NAO');
  assert.equal(src.calls[0], 'ARA');
  const src2 = memory([TR, OTHER]);
  await svc(src2).search('mt 5 14', 'XYZ');
  assert.equal(src2.calls[0], 'XYZ');
  const src3 = memory([{ ...OTHER }, { ...TR, code: 'B', isDefault: false }]);
  await svc(src3).search('mt 5 14');
  assert.equal(src3.calls[0], 'XYZ');
  assert.deepEqual(await svc(memory([])).search('mt 5 14'), { mode: 'NONE', hits: [] });
});

test('PrismaBibleSource escapa %, _ e \\ e passa tudo como parâmetro', async () => {
  type SqlLike = { strings: string[]; values: unknown[] };
  let captured: { strings: string[]; values: unknown[] } | null = null;
  const prisma = {
    async $queryRaw(strings: string[], ...values: unknown[]) {
      captured = { strings: [...strings], values };
      return [{ book: 43, chapter: 3, verse: 16, text: 'x' }];
    },
  };
  const out = await new PrismaBibleSource(prisma as never).searchText('ARA', ['100%', 'a_b', 'c\\d'], 20);
  assert.deepEqual(out, [{ book: 43, chapter: 3, verse: 16, text: 'x' }]);
  assert.ok(captured);
  const { strings, values } = captured as { strings: string[]; values: unknown[] };
  const nested = values.find((v): v is SqlLike => typeof v === 'object' && v !== null && 'strings' in v);
  assert.ok(nested, 'condições do LIKE vão em um fragmento parametrizado');
  assert.deepEqual(nested.values, ['%100\\%%', '%a\\_b%', '%c\\\\d%']);
  assert.ok(nested.strings.join('?').includes("ESCAPE '\\'"));
  assert.ok(values.includes('ARA'));
  assert.ok(values.includes(20));
  const order = values.find((v): v is SqlLike => typeof v === 'object' && v !== null && 'strings' in v && (v as SqlLike).strings.join('').includes('regexp_replace'));
  assert.ok(order, 'ordenação por frase exata também é parametrizada');
  assert.deepEqual(order.values, ['% 100\\% a\\_b c\\\\d %']);
  assert.ok(order.strings.join('?').includes("ESCAPE '\\'"));
  assert.ok(![...strings, ...nested.strings].join('').match(/100|a_b/));
});

test('DTO recusa q vazio e de 121 caracteres', async () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const parse = (body: unknown) => pipe.transform(body, { type: 'query', metatype: BibleSearchQuery });
  await assert.rejects(parse({ q: '' }), BadRequestException);
  await assert.rejects(parse({}), BadRequestException);
  await assert.rejects(parse({ q: 'a'.repeat(121) }), BadRequestException);
  await assert.rejects(parse({ q: 'ok', translation: 'a'.repeat(17) }), BadRequestException);
  await parse({ q: 'a'.repeat(120), translation: 'ARA' });
});
