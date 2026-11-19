import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { BIBLE_BOOKS } from './bible-books';
import { BIBLE_PRESETS, importBible } from './bible-import';
import type { VplVerse } from './bible-vpl';

function canonSet(): VplVerse[] {
  const all = BIBLE_BOOKS.flatMap((b) =>
    Array.from({ length: b.chapters }, (_, i) => ({ book: b.number, chapter: i + 1, verse: 1, text: 'x' })),
  );
  all[0] = { book: 1, chapter: 1, verse: 1, text: 'No princípio criou Deus os céus' };
  return all;
}

function fakePrisma() {
  const calls: string[] = [];
  const created: Array<{ translationId: string; searchText: string; text: string }> = [];
  const batches: number[] = [];
  const tx = {
    bibleTranslation: {
      upsert: async (args: { where: { code: string } }) => {
        calls.push(`upsert:${args.where.code}`);
        return { id: 'tr-1' };
      },
      updateMany: async () => {
        calls.push('updateMany');
        return { count: 0 };
      },
    },
    bibleVerse: {
      deleteMany: async (args: { where: { translationId: string } }) => {
        calls.push(`deleteMany:${args.where.translationId}`);
        return { count: 0 };
      },
      createMany: async (args: { data: typeof created }) => {
        calls.push('createMany');
        batches.push(args.data.length);
        created.push(...args.data);
        return { count: args.data.length };
      },
    },
  };
  const opts: unknown[] = [];
  const prisma = {
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>, o: unknown) => {
      calls.push('transaction');
      opts.push(o);
      return fn(tx);
    },
  } as unknown as PrismaClient;
  return { prisma, calls, created, batches, opts };
}

test('BIBLE_PRESETS: só BLIVRE, com a licença', () => {
  assert.deepEqual(Object.keys(BIBLE_PRESETS), ['BLIVRE']);
  assert.equal(BIBLE_PRESETS.BLIVRE.code, 'BLIVRE');
  assert.equal(BIBLE_PRESETS.BLIVRE.license, 'Creative Commons Atribuição 4.0 Brasil');
  assert.equal(BIBLE_PRESETS.BLIVRE.isDefault, true);
});

test('importBible: grava a tradução e os versículos com searchText sem acento', async () => {
  const f = fakePrisma();
  const verses = canonSet();
  const res = await importBible(f.prisma, BIBLE_PRESETS.BLIVRE, verses);
  assert.equal(res.verses, verses.length);
  assert.equal(f.created.length, verses.length);
  assert.equal(f.created[0].searchText, 'no principio criou deus os ceus');
  assert.equal(f.created[0].text, 'No princípio criou Deus os céus');
  assert.equal(f.created[0].translationId, 'tr-1');
  assert.ok(f.batches.every((n) => n <= 2000));
  assert.deepEqual(f.opts, [{ timeout: 120_000 }]);
});

test('importBible: apaga os versículos anteriores antes de gravar e desmarca as outras padrão', async () => {
  const f = fakePrisma();
  await importBible(f.prisma, BIBLE_PRESETS.BLIVRE, canonSet());
  const iDelete = f.calls.indexOf('deleteMany:tr-1');
  const iCreate = f.calls.indexOf('createMany');
  assert.ok(iDelete > -1 && iDelete < iCreate);
  assert.ok(f.calls.includes('updateMany'));
});

test('importBible: não desmarca as outras quando não é padrão', async () => {
  const f = fakePrisma();
  await importBible(f.prisma, { ...BIBLE_PRESETS.BLIVRE, isDefault: false }, canonSet());
  assert.ok(!f.calls.includes('updateMany'));
});

test('importBible: conjunto incompleto falha antes de qualquer escrita', async () => {
  const f = fakePrisma();
  await assert.rejects(() => importBible(f.prisma, BIBLE_PRESETS.BLIVRE, canonSet().slice(0, 100)));
  assert.deepEqual(f.calls, []);
});
