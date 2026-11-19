import { BIBLE_BOOKS } from './bible-books';

export type ParsedReference = { book: number; chapter: number; verseStart: number | null; verseEnd: number | null };

export function normalizeBibleText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const ALIAS_TO_BOOK = new Map<string, number>();
for (const b of BIBLE_BOOKS) for (const a of b.aliases) if (!ALIAS_TO_BOOK.has(a)) ALIAS_TO_BOOK.set(a, b.number);

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' };
const NAME_RE = /^(?:(1|2|3|iii|ii|i)\s*[ªºao]?\s*)?([a-z]+)\s*(.*)$/;
const NAME_NO_ORD_RE = /^(1|2|3|iii|ii|i)\s*([a-z]+)\s*(.*)$/;

function lookup(numeral: string | undefined, name: string): number | undefined {
  const n = numeral ? (ROMAN[numeral] ?? numeral) : '';
  return ALIAS_TO_BOOK.get(n + name);
}

function toInt(s: string): number {
  return Number.parseInt(s, 10);
}

export function parseReference(text: string): ParsedReference | null {
  // "Jó" (com acento) é o livro 18; sem acento, "jo" é João.
  let raw = text.normalize('NFC').trim();
  if (/^jó(?![a-zà-ú])/i.test(raw)) raw = 'job' + raw.slice(2);
  // ponto logo depois de letra é abreviação ("Mt."); depois de número continua separador ("5.14")
  const s = normalizeBibleText(raw)
    .replace(/([a-zªº])\./g, '$1 ')
    .replace(/^c[aâ]ntico dos canticos\b/, 'canticodoscanticos')
    .replace(/^cantares de salomao\b/, 'cantaresdesalomao');
  if (!s) return null;

  let book: number | undefined;
  let tail = '';
  const candidates: Array<[string | undefined, string, string]> = [];
  for (const re of [NAME_RE, NAME_NO_ORD_RE]) {
    const m = re.exec(s);
    if (m) candidates.push([m[1], m[2], m[3]]);
  }
  const bare = /^([a-z]+)\s*(.*)$/.exec(s);
  if (bare) candidates.push([undefined, bare[1], bare[2]]);
  for (const [numeral, name, rest] of candidates) {
    const found = lookup(numeral, name);
    if (found) {
      book = found;
      tail = rest;
      break;
    }
  }
  if (!book) return null;
  const info = BIBLE_BOOKS[book - 1];

  const A = /^(\d{1,3})$/.exec(tail);
  const B = /^(\d{1,3})[\s:.,]+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/.exec(tail);
  const C = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(tail);
  let chapter: number;
  let verseStart: number | null = null;
  let verseEnd: number | null = null;

  if (info.chapters === 1 && (A || C)) {
    // livro de um capítulo só: número isolado é versículo ("jd 3")
    chapter = 1;
    verseStart = toInt((A ?? C)![1]);
    verseEnd = C ? toInt(C[2]) : verseStart;
  } else if (A) {
    chapter = toInt(A[1]);
  } else if (B) {
    chapter = toInt(B[1]);
    verseStart = toInt(B[2]);
    verseEnd = B[3] ? toInt(B[3]) : verseStart;
  } else {
    return null;
  }

  if (chapter < 1 || chapter > info.chapters) return null;
  if (verseStart !== null && (verseStart < 1 || (verseEnd as number) > 200 || (verseEnd as number) < verseStart)) return null;
  return { book, chapter, verseStart, verseEnd };
}

export function formatReference(ref: ParsedReference): string {
  const name = BIBLE_BOOKS[ref.book - 1]?.name ?? '';
  if (ref.verseStart === null) return `${name} ${ref.chapter}`;
  const end = ref.verseEnd ?? ref.verseStart;
  return end === ref.verseStart ? `${name} ${ref.chapter}:${ref.verseStart}` : `${name} ${ref.chapter}:${ref.verseStart}-${end}`;
}
