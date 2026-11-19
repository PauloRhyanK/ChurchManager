import type { PrismaClient } from '@prisma/client';
import { normalizeBibleText } from './bible-reference';
import { assertCanon, type VplVerse } from './bible-vpl';

export type TranslationMeta = {
  code: string;
  name: string;
  shortName: string;
  license: string;
  attribution: string;
  sourceUrl: string;
  sourceVersion: string;
  isDefault: boolean;
};

export const BIBLE_PRESETS: Record<string, TranslationMeta> = {
  BLIVRE: {
    code: 'BLIVRE',
    name: 'Bíblia Livre',
    shortName: 'Bíblia Livre',
    license: 'Creative Commons Atribuição 4.0 Brasil',
    attribution:
      'Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio, e Marco Teles, http://sites.google.com/site/biblialivre/ - fevereiro de 2018. Licença Creative Commons Atribuição 4.0 Brasil (http://creativecommons.org/licenses/by/4.0/br/).',
    sourceUrl: 'https://ebible.org/details.php?id=porbr2018',
    sourceVersion: 'fevereiro de 2018',
    isDefault: true,
  },
};

const BATCH_SIZE = 2000;

/** Grava a tradução e substitui todos os versículos dela, numa única transação. */
export async function importBible(
  prisma: PrismaClient,
  meta: TranslationMeta,
  verses: VplVerse[],
): Promise<{ verses: number }> {
  assertCanon(verses);
  await prisma.$transaction(
    async (tx) => {
      const { code, ...fields } = meta;
      const translation = await tx.bibleTranslation.upsert({
        where: { code },
        create: { code, ...fields },
        update: fields,
      });
      if (meta.isDefault) {
        await tx.bibleTranslation.updateMany({ where: { id: { not: translation.id } }, data: { isDefault: false } });
      }
      await tx.bibleVerse.deleteMany({ where: { translationId: translation.id } });
      for (let i = 0; i < verses.length; i += BATCH_SIZE) {
        await tx.bibleVerse.createMany({
          data: verses.slice(i, i + BATCH_SIZE).map((v) => ({
            translationId: translation.id,
            book: v.book,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
            searchText: normalizeBibleText(v.text),
          })),
        });
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  return { verses: verses.length };
}
