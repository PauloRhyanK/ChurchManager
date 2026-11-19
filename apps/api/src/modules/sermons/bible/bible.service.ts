import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatReference, normalizeBibleText, parseReference } from './bible-reference';

export const BIBLE_SOURCE = Symbol('BIBLE_SOURCE');

export interface BibleSource {
  translations(): Promise<{ code: string; name: string; shortName: string; attribution: string; license: string; isDefault: boolean }[]>;
  lookup(translation: string, book: number, chapter: number, start: number | null, end: number | null): Promise<{ number: number; text: string }[]>;
  searchText(translation: string, words: string[], limit: number): Promise<{ book: number; chapter: number; verse: number; text: string }[]>;
}

export type BibleHit = {
  reference: string;
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  translation: string;
  verses: { number: number; text: string }[];
  hint: string | null;
};
export type BibleSearchResult = { mode: 'REFERENCE' | 'TEXT' | 'NONE'; hits: BibleHit[] };

const NONE: BibleSearchResult = { mode: 'NONE', hits: [] };
const MAX_CHAPTER_VERSES = 200;
const TEXT_LIMIT = 20;
const MIN_TEXT_LENGTH = 3;

/** Escapa os curingas do LIKE para que o texto digitado valha ao pé da letra. */
function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** "jo 3 999" ou "mt 99": livro conhecido seguido de números que não formam referência válida. */
function looksLikeReference(text: string): boolean {
  const prefix = /^(.*?\S)(?:[\s.:,\-–]*\d+)+$/.exec(text)?.[1];
  return prefix !== undefined && parseReference(`${prefix} 1`) !== null;
}

type Row = { book: number; chapter: number; verse: number; text: string };

/** Leitura da Bíblia no banco. As tabelas são globais (sem tenant). */
@Injectable()
export class PrismaBibleSource implements BibleSource {
  constructor(private readonly prisma: PrismaService) {}

  translations() {
    return this.prisma.bibleTranslation.findMany({
      select: { code: true, name: true, shortName: true, attribution: true, license: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  async lookup(translation: string, book: number, chapter: number, start: number | null, end: number | null) {
    const rows = await this.prisma.bibleVerse.findMany({
      where: {
        translation: { code: translation },
        book,
        chapter,
        ...(start === null ? {} : { verse: { gte: start, lte: end ?? start } }),
      },
      select: { verse: true, text: true },
      orderBy: { verse: 'asc' },
      take: MAX_CHAPTER_VERSES,
    });
    return rows.map((r) => ({ number: r.verse, text: r.text }));
  }

  async searchText(translation: string, words: string[], limit: number): Promise<Row[]> {
    const likes = words.map((w) => Prisma.sql`v.search_text LIKE ${`%${escapeLike(w)}%`} ESCAPE '\\'`);
    // Frase exata (sem a pontuação do versículo) vem antes das palavras espalhadas.
    const phraseLike = `% ${escapeLike(words.join(' '))} %`;
    return this.prisma.$queryRaw<Row[]>`
      SELECT v.book, v.chapter, v.verse, v.text
      FROM bible_verses v
      JOIN bible_translations t ON t.id = v.translation_id
      WHERE t.code = ${translation} AND ${Prisma.join(likes, ' AND ')}
      ORDER BY
        CASE WHEN ${Prisma.sql`' ' || regexp_replace(regexp_replace(v.search_text, '[^a-z0-9 ]', ' ', 'g'), ' +', ' ', 'g') || ' ' LIKE ${phraseLike} ESCAPE '\\'`} THEN 0 ELSE 1 END,
        v.book, v.chapter, v.verse
      LIMIT ${limit}`;
  }
}

const COUNT_WORDS: Record<number, string> = { 2: 'Dois', 3: 'Três' };

@Injectable()
export class BibleService {
  constructor(@Inject(BIBLE_SOURCE) private readonly source: BibleSource) {}

  translations() {
    return this.source.translations();
  }

  async search(q: string, translation?: string): Promise<BibleSearchResult> {
    const all = await this.source.translations();
    const chosen = all.find((t) => t.code === translation) ?? all.find((t) => t.isDefault) ?? all[0];
    if (!chosen) return NONE;
    const text = q.trim();
    const ref = parseReference(text);
    if (ref) return this.byReference(chosen.code, ref);
    if (looksLikeReference(text)) return NONE;
    return this.byText(chosen.code, text);
  }

  private hit(code: string, book: number, chapter: number, verses: { number: number; text: string }[], hint: string | null, whole = false): BibleHit {
    const verseStart = verses[0].number;
    const verseEnd = verses[verses.length - 1].number;
    return {
      reference: formatReference({ book, chapter, verseStart: whole ? null : verseStart, verseEnd: whole ? null : verseEnd }),
      book,
      chapter,
      verseStart,
      verseEnd,
      translation: code,
      verses,
      hint,
    };
  }

  private async byReference(code: string, ref: NonNullable<ReturnType<typeof parseReference>>): Promise<BibleSearchResult> {
    const { book, chapter, verseStart, verseEnd } = ref;
    if (verseStart === null) {
      const verses = (await this.source.lookup(code, book, chapter, null, null)).slice(0, MAX_CHAPTER_VERSES);
      if (!verses.length) return NONE;
      const n = verses.length;
      return { mode: 'REFERENCE', hits: [this.hit(code, book, chapter, verses, `Capítulo inteiro · ${n} ${n === 1 ? 'versículo' : 'versículos'}`, true)] };
    }
    if (verseEnd !== null && verseEnd !== verseStart) {
      const verses = await this.source.lookup(code, book, chapter, verseStart, verseEnd);
      if (!verses.length) return NONE;
      return { mode: 'REFERENCE', hits: [this.hit(code, book, chapter, verses, null)] };
    }
    const own = await this.source.lookup(code, book, chapter, verseStart, verseStart);
    if (!own.length) return NONE;
    const hits = [this.hit(code, book, chapter, own, null)];
    const ahead = await this.source.lookup(code, book, chapter, verseStart + 1, verseStart + 2);
    if (ahead.length) {
      const run = [...own, ...ahead];
      const last = run[run.length - 1].number;
      hits.push(this.hit(code, book, chapter, run, `${COUNT_WORDS[run.length]} versículos · do ${verseStart} ao ${last}`));
      const next = ahead.find((v) => v.number === verseStart + 1);
      if (next) hits.push(this.hit(code, book, chapter, [next], null));
    }
    return { mode: 'REFERENCE', hits };
  }

  private async byText(code: string, text: string): Promise<BibleSearchResult> {
    const normalized = normalizeBibleText(text);
    if (normalized.length < MIN_TEXT_LENGTH) return NONE;
    const words = normalized
      .split(' ')
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((w) => w.length >= 2);
    if (!words.length) return NONE;
    const rows = await this.source.searchText(code, words, TEXT_LIMIT);
    return {
      mode: 'TEXT',
      hits: rows.map((r) => this.hit(code, r.book, r.chapter, [{ number: r.verse, text: r.text }], null)),
    };
  }
}
