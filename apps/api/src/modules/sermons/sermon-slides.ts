// Sequência de slides tirada do esboço. Sem dependências além de tipos (este arquivo também vai para o navegador).
import type { Inline, Inner, SermonBlock, SermonDoc } from './sermon-document';

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

const KINDS: SlideKind[] = ['TITLE', 'VERSE', 'POINT', 'SUMMARY', 'PRIVATE'];

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

function blockItems(b: SermonBlock, mode: Exclude<SlideMode, 'FULL'>): SlideItem[] {
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
  if (b.type === 'point' && mode === 'VERSES_AND_POINTS') {
    const text = collapse(inlineText(b.content));
    return text ? [{ id: `${b.attrs.id}:0`, kind: 'POINT', sourceBlockId: b.attrs.id, text: capText(text), reference: null, ...base }] : [];
  }
  return [];
}

function label(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('').trim()}…` : text;
}

export function buildSlides(title: string, doc: SermonDoc, mode: Exclude<SlideMode, 'FULL'>): SlideItem[] {
  const main: SlideItem[] = [];
  const privates: SlideItem[] = [];
  const trimmed = title.trim();
  if (mode === 'VERSES_AND_POINTS' && trimmed) {
    main.push({ id: 'title', kind: 'TITLE', sourceBlockId: null, text: capText(trimmed), reference: null, included: true, edited: false });
  }
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
    } else main.push(...blockItems(b, mode));
  }
  return [...main.slice(0, SLIDE_LIMITS.items), ...privates].slice(0, SLIDE_LIMITS.items);
}

export function countSlides(title: string, doc: SermonDoc): { VERSES: number; VERSES_AND_POINTS: number } {
  const n = (mode: 'VERSES' | 'VERSES_AND_POINTS') => buildSlides(title, doc, mode).filter((s) => s.kind !== 'PRIVATE').length;
  return { VERSES: n('VERSES'), VERSES_AND_POINTS: n('VERSES_AND_POINTS') };
}

export function mergeSlides(previous: SlideItem[], fresh: SlideItem[]): SlideItem[] {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  const freshById = new Map(fresh.map((f) => [f.id, f]));
  const merge = (f: SlideItem): SlideItem => {
    const p = prevById.get(f.id);
    if (!p) return f;
    const kept = p.edited ? { text: p.text, edited: true } : {};
    return { ...f, included: f.kind === 'PRIVATE' ? false : p.included, ...kept };
  };
  const result: SlideItem[] = [];
  const seen = new Set<string>();
  for (const p of previous) {
    const f = freshById.get(p.id);
    if (f && f.kind !== 'PRIVATE' && !seen.has(p.id)) {
      seen.add(p.id);
      result.push(merge(f));
    }
  }
  fresh.forEach((f, i) => {
    if (f.kind === 'PRIVATE' || prevById.has(f.id)) return;
    const before = i > 0 ? result.findIndex((r) => r.id === fresh[i - 1].id) : -1;
    result.splice(before + 1, 0, f);
  });
  for (const f of fresh) if (f.kind === 'PRIVATE') result.push({ ...merge(f), included: false });
  return result;
}

export function publicSlides(items: SlideItem[]): PublicSlide[] {
  const out: PublicSlide[] = [];
  for (const s of items) {
    if (s.included && s.kind !== 'PRIVATE') out.push({ kind: s.kind, text: s.text, reference: s.reference });
  }
  return out;
}

/** Lê a coluna Json; o que estiver fora do formato é descartado. */
export function parseStoredSlides(value: unknown): SlideItem[] {
  if (!Array.isArray(value)) return [];
  const out: SlideItem[] = [];
  const ids = new Set<string>();
  for (const v of value) {
    if (typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    if (
      typeof o.id !== 'string' || !o.id ||
      typeof o.kind !== 'string' || !KINDS.includes(o.kind as SlideKind) ||
      typeof o.text !== 'string' ||
      !(o.sourceBlockId === null || typeof o.sourceBlockId === 'string') ||
      !(o.reference === null || typeof o.reference === 'string') ||
      typeof o.included !== 'boolean' ||
      typeof o.edited !== 'boolean' ||
      ids.has(o.id)
    ) continue;
    ids.add(o.id);
    const kind = o.kind as SlideKind;
    out.push({
      id: o.id,
      kind,
      sourceBlockId: o.sourceBlockId as string | null,
      text: kind === 'VERSE' ? o.text : Array.from(o.text).slice(0, SLIDE_LIMITS.textChars).join(''),
      reference: o.reference as string | null,
      included: kind === 'PRIVATE' ? false : o.included,
      edited: o.edited,
    });
    if (out.length >= SLIDE_LIMITS.items) break;
  }
  return out;
}
