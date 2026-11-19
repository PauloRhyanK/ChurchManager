import { BIBLE_BOOKS, bookByVplCode } from './bible-books';
import { normalizeBibleText } from './bible-reference';

export type VplVerse = { book: number; chapter: number; verse: number; text: string };

const LINE_RE = /^(\S{3}) (\d{1,3}):(\d{1,3}) (.*)$/;
const MARKER_RE = /^\[([^\]]+)\]\s*:\s*/;

// Letras do acróstico do Salmo 119 como aparecem no arquivo de origem. Outros colchetes com dois-pontos
// ("[Ela] :", "[Dizendo] :") fazem parte do texto e ficam.
const ACROSTIC_LETTERS = new Set(
  [
    'Álefe', 'Bete', 'Guímel', 'Dálete', 'Hê', 'Vau', 'Záin', 'Hete', 'Tete', 'Iode', 'Cafe',
    'Lâmede', 'Mem', 'Nun', 'Sâmeque', 'Áin', 'Pê', 'Tsadê', 'Cofe', 'Rexe', 'Xin', 'Tau',
  ].map(normalizeBibleText),
);

function stripAcrostic(text: string): string {
  const m = MARKER_RE.exec(text);
  if (m && ACROSTIC_LETTERS.has(normalizeBibleText(m[1]))) return text.slice(m[0].length);
  return text;
}

export function parseVpl(content: string): VplVerse[] {
  const verses: VplVerse[] = [];
  const seen = new Set<string>();
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (raw.trim() === '') return;
    const n = i + 1;
    const m = LINE_RE.exec(raw);
    if (!m) throw new Error(`Linha ${n} malformada: "${raw.slice(0, 60)}"`);
    const book = bookByVplCode(m[1]);
    if (!book) throw new Error(`Linha ${n}: código de livro desconhecido "${m[1]}"`);
    const chapter = Number.parseInt(m[2], 10);
    const verse = Number.parseInt(m[3], 10);
    const text = stripAcrostic(m[4].trim()).trim();
    if (!text) throw new Error(`Linha ${n}: versículo ${m[1]} ${chapter}:${verse} sem texto`);
    const key = `${book.number}:${chapter}:${verse}`;
    if (seen.has(key)) throw new Error(`Linha ${n}: versículo repetido ${m[1]} ${chapter}:${verse}`);
    seen.add(key);
    verses.push({ book: book.number, chapter, verse, text });
  });
  return verses;
}

/** Confere que todos os 66 livros estão presentes e que cada um tem exatamente os capítulos esperados. */
export function assertCanon(verses: VplVerse[]): void {
  const chaptersByBook = new Map<number, Set<number>>();
  for (const v of verses) {
    let set = chaptersByBook.get(v.book);
    if (!set) chaptersByBook.set(v.book, (set = new Set()));
    set.add(v.chapter);
  }
  for (const b of BIBLE_BOOKS) {
    const set = chaptersByBook.get(b.number);
    if (!set) throw new Error(`Livro ausente: ${b.name}`);
    if (set.size !== b.chapters || Math.max(...set) !== b.chapters) {
      throw new Error(`${b.name}: esperados ${b.chapters} capítulos, encontrados ${set.size}`);
    }
  }
  if (chaptersByBook.size !== BIBLE_BOOKS.length) throw new Error('Livros além do cânon de 66 livros');
}
