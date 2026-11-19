// Cópia para o navegador de apps/api/src/modules/sermons/sermon-document.ts (só tipos e limites, sem o validador)
// e de sermon-derive.ts (lógica inalterada). Se um lado mudar, o outro precisa acompanhar.
export type Inline = { type: 'text'; text: string; marks?: { type: 'bold' | 'italic' }[] } | { type: 'hardBreak' };

export type VerseAttrs = {
  id: string;
  reference: string; // "João 8:12" ou "Mateus 5:14-16", como aparece na tela
  book: number | null; // 1–66; nulo quando digitado à mão sem referência reconhecida
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
  translation: string | null; // código da tradução ("BLIVRE"); nulo quando digitado à mão
  verses: { number: number | null; text: string }[]; // o texto, copiado para dentro do documento
};

export type SermonBlock =
  | { type: 'paragraph'; content?: Inline[] }
  | { type: 'heading'; attrs: { id: string; level: 2 | 3 }; content?: Inline[] }
  | { type: 'bulletList'; content: ListItem[] }
  | { type: 'orderedList'; attrs?: { start?: number; type?: string | null }; content: ListItem[] }
  | { type: 'point'; attrs: { id: string }; content?: Inline[] }
  | { type: 'verse'; attrs: VerseAttrs }
  | { type: 'illustration' | 'application' | 'privateNote'; attrs: { id: string }; content: Inner[] };

export type Inner = Extract<SermonBlock, { type: 'paragraph' | 'bulletList' | 'orderedList' }>;
export type ListItem = { type: 'listItem'; content: Inner[] };
export type SermonDoc = { type: 'doc'; content: SermonBlock[] };

export const DOC_LIMITS = { nodes: 3000, chars: 300_000, depth: 8, id: 36, reference: 120, verses: 200 } as const;

export const EMPTY_DOC: SermonDoc = { type: 'doc', content: [{ type: 'paragraph' }] };


export const SPEECH_PACE = { wordsPerMinute: 130, pointSeconds: 60, illustrationSeconds: 90, applicationSeconds: 60 } as const;

export type SermonSection = {
  id: string | null; // id do Ponto ou do Título de seção; null na Abertura
  kind: 'OPENING' | 'POINT' | 'HEADING';
  title: string; // "Abertura"; texto do Ponto sem número; texto do título
  number: number | null; // 1, 2, 3… só nos Pontos
  seconds: number;
  minutes: number; // Math.max(1, Math.round(seconds / 60))
};

export type DerivedSermon = {
  sections: SermonSection[];
  verses: { id: string; reference: string }[]; // na ordem, sem repetir referência
  baseReference: string | null; // a do primeiro bloco verse
  pointCount: number;
  verseRefs: string; // referências normalizadas, uma por linha
  estimatedSeconds: number; // soma dos seconds das seções
};

/** NFD sem diacríticos, minúsculas, espaços colapsados. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Pedaços separados por espaço que têm letra ou dígito. */
export function countWords(text: string): number {
  let n = 0;
  for (const piece of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(piece)) n++;
  return n;
}

function inlineText(content: Inline[] | undefined): string {
  return (content ?? []).map((c) => (c.type === 'text' ? c.text : ' ')).join('');
}

function innerWords(blocks: Inner[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'paragraph') n += countWords(inlineText(b.content));
    else for (const item of b.content) n += innerWords(item.content);
  }
  return n;
}

function blockWords(b: SermonBlock): number {
  switch (b.type) {
    case 'paragraph':
    case 'heading':
    case 'point':
      return countWords(inlineText(b.content));
    case 'bulletList':
    case 'orderedList':
      return b.content.reduce((n, item) => n + innerWords(item.content), 0);
    case 'illustration':
    case 'application':
      return innerWords(b.content);
    case 'verse':
      return b.attrs.verses.reduce((n, v) => n + countWords(v.text), 0);
    case 'privateNote':
      return 0;
  }
}

function allowance(b: SermonBlock): number {
  if (b.type === 'point') return SPEECH_PACE.pointSeconds;
  if (b.type === 'illustration') return SPEECH_PACE.illustrationSeconds;
  if (b.type === 'application') return SPEECH_PACE.applicationSeconds;
  return 0;
}

/** Conta como conteúdo da Abertura: tudo, menos "Só para mim" e parágrafo sem texto. */
function isOpeningContent(b: SermonBlock): boolean {
  if (b.type === 'privateNote') return false;
  if (b.type === 'paragraph') return inlineText(b.content).trim() !== '';
  return true;
}

export function deriveSermon(doc: SermonDoc): DerivedSermon {
  type Draft = Omit<SermonSection, 'seconds' | 'minutes'> & { words: number; extra: number };
  const drafts: Draft[] = [];
  const verses: { id: string; reference: string }[] = [];
  const seenRefs = new Set<string>();
  let pointCount = 0;
  let current: Draft = { id: null, kind: 'OPENING', title: 'Abertura', number: null, words: 0, extra: 0 };
  let openingHasContent = false;

  const close = () => {
    if (current.kind !== 'OPENING' || openingHasContent) drafts.push(current);
  };

  for (const b of doc.content) {
    if (b.type === 'point' || (b.type === 'heading' && b.attrs.level === 2)) {
      close();
      const isPoint = b.type === 'point';
      if (isPoint) pointCount++;
      current = {
        id: b.attrs.id,
        kind: isPoint ? 'POINT' : 'HEADING',
        title: inlineText(b.content).trim(),
        number: isPoint ? pointCount : null,
        words: 0,
        extra: 0,
      };
    } else if (current.kind === 'OPENING' && isOpeningContent(b)) {
      openingHasContent = true;
    }
    current.words += blockWords(b);
    current.extra += allowance(b);

    if (b.type === 'verse') {
      const key = normalizeSearch(b.attrs.reference);
      if (!seenRefs.has(key)) {
        seenRefs.add(key);
        verses.push({ id: b.attrs.id, reference: b.attrs.reference });
      }
    }
  }
  close();

  const sections: SermonSection[] = drafts.map(({ words, extra, ...s }) => {
    const seconds = Math.round((words / SPEECH_PACE.wordsPerMinute) * 60) + extra;
    return { ...s, seconds, minutes: Math.max(1, Math.round(seconds / 60)) };
  });

  return {
    sections,
    verses,
    baseReference: verses.length > 0 ? verses[0].reference : null,
    pointCount,
    verseRefs: verses.map((v) => normalizeSearch(v.reference)).join('\n'),
    estimatedSeconds: sections.reduce((n, s) => n + s.seconds, 0),
  };
}

/** Igualdade profunda de JSON sem olhar a ordem das chaves (o banco devolve o jsonb com as chaves reordenadas). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
