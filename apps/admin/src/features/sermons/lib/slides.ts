// Cópia para o navegador de apps/api/src/modules/sermons/sermon-slides.ts (lógica inalterada; sem mergeSlides e parseStoredSlides,
// que só o servidor usa). Se um lado mudar, o outro precisa acompanhar.
import type { Inline, Inner, SermonBlock, SermonDoc } from './document';

export type SlideMode = 'VERSES' | 'VERSES_AND_POINTS' | 'FULL';
export type SlideStyle = 'MINIMAL' | 'BACKGROUND';
export type SlideKind = 'TITLE' | 'VERSE' | 'POINT' | 'SUMMARY' | 'PRIVATE';
export type SlideItem = {
  id: string; // 'title' | `${blockId}:${n}`
  kind: SlideKind;
  sourceBlockId: string | null;
  text: string;
  reference: string | null;
  included: boolean;
  edited: boolean;
};
export type PublicSlide = { kind: Exclude<SlideKind, 'PRIVATE'>; text: string; reference: string | null };

export const SLIDE_LIMITS = { verseChars: 220, textChars: 300, items: 400, privateLabel: 80 } as const;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

function inlineText(content: Inline[] | undefined): string {
  return (content ?? []).map((c) => (c.type === 'text' ? c.text : ' ')).join('');
}

function innerText(blocks: Inner[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') parts.push(inlineText(b.content));
    else for (const li of b.content) parts.push(innerText(li.content));
  }
  return parts.join(' ');
}

/** Pedaços de até 220: corta depois de . ; : ? ! seguido de espaço; o que ainda passa, no último espaço. */
function splitVerse(raw: string): string[] {
  const text = collapse(raw);
  const max = SLIDE_LIMITS.verseChars;
  if (text.length <= max) return text ? [text] : [];
  const pieces: string[] = [];
  let current = '';
  const push = (s: string) => {
    if (current && current.length + 1 + s.length <= max) current += ` ${s}`;
    else {
      if (current) pieces.push(current);
      current = s;
    }
  };
  for (let sentence of text.split(/(?<=[.;:?!])\s+/)) {
    while (sentence.length > max) {
      const cut = sentence.lastIndexOf(' ', max);
      if (cut > 0) {
        push(sentence.slice(0, cut));
        sentence = sentence.slice(cut + 1);
      } else {
        push(sentence.slice(0, max));
        sentence = sentence.slice(max);
      }
      // um pedaço cortado à força ou no espaço fecha a linha
      pieces.push(current);
      current = '';
    }
    if (sentence) push(sentence);
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Até `max` caracteres (por ponto de código): corta no último espaço antes do limite e põe reticências. */
function capText(text: string, max: number = SLIDE_LIMITS.textChars): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  let head = chars.slice(0, max - 1).join('');
  const cut = head.lastIndexOf(' ');
  if (cut > 0) head = head.slice(0, cut);
  return `${head.trimEnd()}…`;
}

function verseReference(blockRef: string, number: number | null): string {
  const m = /^(.*\d+):\d+(?:-\d+)?$/.exec(blockRef);
  return m && number !== null ? `${m[1]}:${number}` : blockRef;
}

function blockItems(b: SermonBlock, mode: SlideMode): SlideItem[] {
  const base = { included: true, edited: false };
  if (b.type === 'verse') {
    const out: SlideItem[] = [];
    for (const v of b.attrs.verses) {
      for (const text of splitVerse(v.text)) {
        out.push({
          id: `${b.attrs.id}:${out.length}`,
          kind: 'VERSE',
          sourceBlockId: b.attrs.id,
          text,
          reference: verseReference(b.attrs.reference, v.number),
          ...base,
        });
      }
    }
    return out;
  }
  if (b.type === 'point' && mode !== 'VERSES') {
    const text = collapse(inlineText(b.content));
    return text ? [{ id: `${b.attrs.id}:0`, kind: 'POINT', sourceBlockId: b.attrs.id, text: capText(text), reference: null, ...base }] : [];
  }
  return [];
}

function label(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('').trim()}…` : text;
}

export function buildSlides(title: string, doc: SermonDoc, mode: SlideMode, summaries?: Record<string, string>): SlideItem[] {
  const main: SlideItem[] = [];
  const privates: SlideItem[] = [];
  const summaryById = new Map<string, SlideItem>();
  if (mode === 'FULL' && summaries) {
    for (const t of summaryTargets(doc)) {
      const text = Object.prototype.hasOwnProperty.call(summaries, t.id) ? collapse(String(summaries[t.id])) : '';
      if (text) {
        summaryById.set(t.id, { id: t.id, kind: 'SUMMARY', sourceBlockId: t.sourceBlockId, text: capText(text), reference: null, included: true, edited: false });
      }
    }
  }
  const pushSummary = (id: string) => {
    const s = summaryById.get(id);
    if (s) main.push(s);
  };
  const trimmed = title.trim();
  if (mode !== 'VERSES' && trimmed) {
    main.push({ id: 'title', kind: 'TITLE', sourceBlockId: null, text: capText(trimmed), reference: null, included: true, edited: false });
  }
  pushSummary(OPENING_ID);
  for (const b of doc.content) {
    if (b.type === 'privateNote') {
      const text = collapse(innerText(b.content));
      if (!text) continue;
      const max = SLIDE_LIMITS.privateLabel;
      privates.push({
        id: `${b.attrs.id}:0`,
        kind: 'PRIVATE',
        sourceBlockId: b.attrs.id,
        text: label(text, max),
        reference: null,
        included: false,
        edited: false,
      });
      continue;
    }
    if (b.type === 'illustration' || b.type === 'application' || b.type === 'heading') pushSummary(`${b.attrs.id}:0`);
    main.push(...blockItems(b, mode));
  }
  return [...main.slice(0, SLIDE_LIMITS.items), ...privates].slice(0, SLIDE_LIMITS.items);
}

export function countSlides(title: string, doc: SermonDoc): { VERSES: number; VERSES_AND_POINTS: number; FULL: number } {
  const n = (mode: 'VERSES' | 'VERSES_AND_POINTS') => buildSlides(title, doc, mode).filter((s) => s.kind !== 'PRIVATE').length;
  const versesAndPoints = n('VERSES_AND_POINTS');
  return { VERSES: n('VERSES'), VERSES_AND_POINTS: versesAndPoints, FULL: versesAndPoints + summaryTargets(doc).length };
}

// ---- Partes resumidas por IA em "Slides completos" ----

export type SummaryTarget = {
  id: string; // id do slide: 'opening:0' ou `${blockId}:0`
  sourceBlockId: string | null; // null na Abertura
  part: 'OPENING' | 'ILLUSTRATION' | 'APPLICATION' | 'SECTION';
  label: string; // "Abertura", "Ilustração", "Aplicação", ou o texto do título de seção
  text: string; // o texto a resumir, sem nenhum bloco "Só para mim"
};

export const SUMMARY_MAX = 90;
const SUMMARY_SOURCE = { chars: 6000, targets: 60, sectionWords: 12, blockWords: 6 } as const;
const OPENING_ID = 'opening:0';

/** Pedaços separados por espaço que têm letra ou dígito (mesma regra de sermon-derive). */
function countWords(text: string): number {
  let n = 0;
  for (const piece of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(piece)) n++;
  return n;
}

/**
 * Partes a resumir, na ordem do documento, só blocos de primeiro nível. Seção nova em cada `point` e em cada
 * `heading` nível 2; a Abertura é o que vem antes da primeira seção. Abertura e seção com título levam o texto dos
 * parágrafos e listas delas; Ilustração e Aplicação, o próprio conteúdo. `privateNote` nunca entra.
 */
export function summaryTargets(doc: SermonDoc): SummaryTarget[] {
  type Entry = Omit<SummaryTarget, 'text'> & { chunks: string[]; minWords: number };
  const entries: Entry[] = [];
  let section: Entry | null = { id: OPENING_ID, sourceBlockId: null, part: 'OPENING', label: 'Abertura', chunks: [], minWords: SUMMARY_SOURCE.sectionWords };
  entries.push(section);
  for (const b of doc.content) {
    switch (b.type) {
      case 'point':
        section = null;
        break;
      case 'heading':
        if (b.attrs.level !== 2) break;
        section = {
          id: `${b.attrs.id}:0`,
          sourceBlockId: b.attrs.id,
          part: 'SECTION',
          label: collapse(inlineText(b.content)) || 'Seção',
          chunks: [],
          minWords: SUMMARY_SOURCE.sectionWords,
        };
        entries.push(section);
        break;
      case 'paragraph':
      case 'bulletList':
      case 'orderedList':
        section?.chunks.push(innerText([b]));
        break;
      case 'illustration':
      case 'application':
        entries.push({
          id: `${b.attrs.id}:0`,
          sourceBlockId: b.attrs.id,
          part: b.type === 'illustration' ? 'ILLUSTRATION' : 'APPLICATION',
          label: b.type === 'illustration' ? 'Ilustração' : 'Aplicação',
          chunks: [innerText(b.content)],
          minWords: SUMMARY_SOURCE.blockWords,
        });
        break;
      default: // verse, privateNote: fora do texto
        break;
    }
  }
  const out: SummaryTarget[] = [];
  for (const { chunks, minWords, ...rest } of entries) {
    const text = collapse(chunks.join(' '));
    if (countWords(text) < minWords) continue;
    out.push({ ...rest, text: Array.from(text).slice(0, SUMMARY_SOURCE.chars).join('') });
    if (out.length >= SUMMARY_SOURCE.targets) break;
  }
  return out;
}

export function publicSlides(items: SlideItem[]): PublicSlide[] {
  const out: PublicSlide[] = [];
  for (const s of items) {
    if (s.included && s.kind !== 'PRIVATE') out.push({ kind: s.kind, text: s.text, reference: s.reference });
  }
  return out;
}
