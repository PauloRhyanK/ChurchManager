// Sequência de slides tirada do esboço. Sem dependências além de tipos (este arquivo também vai para o navegador).
// Modelos e limites: docs/identidade-slides.md, "Como o sistema aplica".
import type { Inline, Inner, SermonBlock, SermonDoc } from './sermon-document';

export type SlideMode = 'VERSES' | 'VERSES_AND_POINTS' | 'FULL';
export type SlideStyle = 'MINIMAL' | 'BACKGROUND';
export type SlideKind = 'TITLE' | 'VERSE' | 'POINT' | 'SUMMARY' | 'PRIVATE';
/** Modelos do manual: 01 só título; 02 título e subtítulo; 03 título e versículo; 04 título, subtítulo e versículo. */
export type SlideLayout = 'M01' | 'M02' | 'M03' | 'M04';
export type SlideItem = {
  id: string; // 'title' | 'title:n' | `${blockId}:${n}` | `${blockId}:lead`
  kind: SlideKind;
  sourceBlockId: string | null;
  text: string; // TITLE/POINT: o título; VERSE: o texto bíblico; SUMMARY: a frase (vai como subtítulo)
  reference: string | null; // só VERSE
  included: boolean;
  edited: boolean; // o pregador mudou o `text`
  subtitleEdited: boolean; // o pregador mudou o subtítulo (e com ele o modelo)
  layout: SlideLayout;
  heading: string | null; // título de contexto de VERSE e SUMMARY
  subtitle: string | null; // POINT em M02; VERSE em M04
  version: string | null; // só VERSE: código da tradução do bloco
};

/** Limites de caracteres de cada modelo (manual). O que passa é dividido em mais slides, nunca encolhido. */
export const SLIDE_MODEL_LIMITS = {
  M01: { title: 75 },
  M02: { title: 60, subtitle: 150 },
  M03: { title: 50, verse: 220 },
  M04: { title: 45, subtitle: 90, verse: 160 },
} as const;

/** O que a tela mostra, já no formato do modelo. */
export type SlideFace = {
  layout: SlideLayout;
  title: string;
  subtitle: string | null;
  verse: string | null;
  reference: string | null; // já com " · VERSÃO" quando houver
};
export type PublicSlide = { kind: Exclude<SlideKind, 'PRIVATE'>; text: string; reference: string | null } & SlideFace;

export const SLIDE_LIMITS = { textChars: 300, items: 400, privateLabel: 80, version: 36 } as const;

const KINDS: SlideKind[] = ['TITLE', 'VERSE', 'POINT', 'SUMMARY', 'PRIVATE'];
export const SLIDE_LAYOUTS: SlideLayout[] = ['M01', 'M02', 'M03', 'M04'];
const DEFAULT_LAYOUT: Record<SlideKind, SlideLayout> = { TITLE: 'M01', POINT: 'M01', VERSE: 'M03', SUMMARY: 'M02', PRIVATE: 'M01' };

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const codePoints = (s: string) => Array.from(s).length;
const cut = (s: string, max: number) => Array.from(s).slice(0, max).join('');

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

/** Pedaços de até `max`: corta depois de . ; : ? ! seguido de espaço; o que ainda passa, no último espaço. */
function splitVerse(raw: string, max: number): string[] {
  const text = collapse(raw);
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
      const at = sentence.lastIndexOf(' ', max);
      if (at > 0) {
        push(sentence.slice(0, at));
        sentence = sentence.slice(at + 1);
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

/** Pedaços de até `max` pontos de código, cortando no último espaço; palavra maior que o limite é cortada seca. */
function splitText(text: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = Array.from(collapse(text));
  while (rest.length > max) {
    const at = rest.lastIndexOf(' ', max);
    if (at > 0) {
      pieces.push(rest.slice(0, at).join(''));
      rest = rest.slice(at + 1);
    } else {
      pieces.push(rest.slice(0, max).join(''));
      rest = rest.slice(max);
    }
  }
  if (rest.length > 0) pieces.push(rest.join(''));
  return pieces;
}

/** Até `max` caracteres (por ponto de código): corta no último espaço antes do limite e põe reticências. */
function capText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  let head = chars.slice(0, max - 1).join('');
  const at = head.lastIndexOf(' ');
  if (at > 0) head = head.slice(0, at);
  return `${head.trimEnd()}…`;
}

/** Título de contexto cortado na última palavra que cabe, com reticências; '' quando nem a primeira palavra cabe. */
function wordCut(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join('');
  const at = head.lastIndexOf(' ');
  if (at <= 0) return '';
  const kept = head.slice(0, at).replace(/[\s,;:.!?—–-]+$/u, '');
  return kept ? `${kept}…` : '';
}

/** Como `wordCut`, mas sem nenhuma palavra que caiba corta seco: o título de contexto nunca fica vazio. */
export function fitContextTitle(text: string, max: number): string {
  return wordCut(text, max) || capText(text, max);
}

function verseReference(blockRef: string, number: number | null): string {
  const m = /^(.*\d+):\d+(?:-\d+)?$/.exec(blockRef);
  return m && number !== null ? `${m[1]}:${number}` : blockRef;
}

function label(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('').trim()}…` : text;
}

/**
 * Deixa o modelo coerente com o que o item tem: M02/M04 sem subtítulo (ou que não cabe) viram M01/M03,
 * o título de contexto e o subtítulo ficam no limite do modelo.
 */
function coherent(s: SlideItem): SlideItem {
  switch (s.kind) {
    case 'POINT':
      if (s.layout === 'M02' && s.subtitle && codePoints(s.text) <= SLIDE_MODEL_LIMITS.M02.title) {
        return { ...s, heading: null, version: null, subtitle: cut(s.subtitle, SLIDE_MODEL_LIMITS.M02.subtitle) };
      }
      return { ...s, layout: 'M01', heading: null, subtitle: null, version: null };
    case 'VERSE':
      if (s.layout === 'M04' && s.subtitle && s.text.length <= SLIDE_MODEL_LIMITS.M04.verse) {
        return {
          ...s,
          heading: s.heading === null ? null : fitContextTitle(s.heading, SLIDE_MODEL_LIMITS.M04.title),
          subtitle: cut(s.subtitle, SLIDE_MODEL_LIMITS.M04.subtitle),
        };
      }
      return { ...s, layout: 'M03', subtitle: null, heading: s.heading === null ? null : fitContextTitle(s.heading, SLIDE_MODEL_LIMITS.M03.title) };
    case 'SUMMARY':
      return {
        ...s,
        layout: 'M02',
        subtitle: null,
        version: null,
        heading: s.heading === null ? null : fitContextTitle(s.heading, SLIDE_MODEL_LIMITS.M02.title),
      };
    default: // TITLE, PRIVATE
      return { ...s, layout: 'M01', heading: null, subtitle: null, version: null };
  }
}

export type SlideFaceInput = Pick<SlideItem, 'kind' | 'text' | 'reference'> & Partial<Pick<SlideItem, 'layout' | 'heading' | 'subtitle' | 'version'>>;

/** O que a tela mostra. Item gravado antes dos modelos (sem `layout`) recebe o padrão do tipo. */
export function slideFace(item: SlideFaceInput): SlideFace {
  const s = coherent({
    id: '',
    sourceBlockId: null,
    included: true,
    edited: false,
    subtitleEdited: false,
    kind: item.kind,
    text: item.text,
    reference: item.reference,
    layout: item.layout && SLIDE_LAYOUTS.includes(item.layout) ? item.layout : DEFAULT_LAYOUT[item.kind],
    heading: item.heading || null,
    subtitle: item.subtitle || null,
    version: item.version || null,
  });
  if (s.kind === 'VERSE') {
    const reference = s.reference && s.version ? `${s.reference} · ${s.version}` : s.reference;
    return { layout: s.layout, title: s.heading ?? s.reference ?? '', subtitle: s.subtitle, verse: s.text, reference };
  }
  if (s.kind === 'SUMMARY') return { layout: 'M02', title: s.heading ?? '', subtitle: s.text, verse: null, reference: null };
  return { layout: s.layout, title: s.text, subtitle: s.subtitle, verse: null, reference: null };
}

/**
 * Divide uma face acima do limite em faces seguidas do mesmo modelo, no último espaço (pontos de código), como
 * `buildSlides`: título de M01 acima de 75 e subtítulo de M02 acima de 150. Serve para linhas gravadas antes dos
 * limites (ex.: ponto de até 300): a fonte nunca encolhe, o texto vai para mais slides.
 */
export function splitFaceForLimits(face: SlideFace): SlideFace[] {
  if (face.layout === 'M01' && codePoints(face.title) > SLIDE_MODEL_LIMITS.M01.title) {
    return splitText(face.title, SLIDE_MODEL_LIMITS.M01.title).map((title) => ({ ...face, title }));
  }
  if (face.layout === 'M02' && face.subtitle !== null && codePoints(face.subtitle) > SLIDE_MODEL_LIMITS.M02.subtitle) {
    return splitText(face.subtitle, SLIDE_MODEL_LIMITS.M02.subtitle).map((subtitle) => ({ ...face, subtitle }));
  }
  return [face];
}

/** Limite do `text` editável no modelo do item (TITLE/POINT título; SUMMARY a frase). */
function textFits(s: SlideItem): boolean {
  if (s.kind === 'SUMMARY') return codePoints(s.text) <= SLIDE_MODEL_LIMITS.M02.subtitle;
  if (s.kind === 'TITLE' || s.kind === 'POINT') return codePoints(s.text) <= SLIDE_MODEL_LIMITS.M01.title;
  return true;
}

/** O subtítulo cabe no modelo, junto do texto que o item tem? */
function subtitleFits(s: SlideItem): boolean {
  if (!s.subtitle) return true;
  if (s.kind === 'POINT') return s.layout === 'M02' && codePoints(s.subtitle) <= SLIDE_MODEL_LIMITS.M02.subtitle && codePoints(s.text) <= SLIDE_MODEL_LIMITS.M02.title;
  if (s.kind === 'VERSE') return s.layout === 'M04' && codePoints(s.subtitle) <= SLIDE_MODEL_LIMITS.M04.subtitle && s.text.length <= SLIDE_MODEL_LIMITS.M04.verse;
  return false;
}

const base = { included: true, edited: false, subtitleEdited: false, heading: null, subtitle: null, version: null } as const;

function titleItems(title: string): SlideItem[] {
  return splitText(title, SLIDE_MODEL_LIMITS.M01.title).map((text, i) => ({
    ...base,
    id: i === 0 ? 'title' : `title:${i}`,
    kind: 'TITLE',
    sourceBlockId: null,
    text,
    reference: null,
    layout: 'M01',
  }));
}

function pointItems(id: string, text: string, decision: AiDecision | undefined): SlideItem[] {
  const subtitle = decision?.layout === 'M02' ? collapse(String(decision.text ?? '')) : '';
  if (subtitle && codePoints(text) <= SLIDE_MODEL_LIMITS.M02.title) {
    return [{
      ...base, id: `${id}:0`, kind: 'POINT', sourceBlockId: id, text, reference: null,
      layout: 'M02', subtitle: capText(subtitle, SLIDE_MODEL_LIMITS.M02.subtitle),
    }];
  }
  return splitText(text, SLIDE_MODEL_LIMITS.M01.title).map((piece, i) => ({
    ...base, id: `${id}:${i}`, kind: 'POINT', sourceBlockId: id, text: piece, reference: null, layout: 'M01',
  }));
}

/**
 * Itens de um bloco Versículo. O texto e a referência vêm sempre do bloco. Em M04, o primeiro versículo leva o
 * subtítulo se couber inteiro em 160 e o título de contexto couber em 45 (na última palavra); senão o 04 é dividido
 * em dois: um slide 02 (`<id>:lead`, título de contexto e subtítulo) seguido dos slides 03 do versículo.
 */
function verseItems(b: Extract<SermonBlock, { type: 'verse' }>, context: string, decision: AiDecision | undefined): SlideItem[] {
  const id = b.attrs.id;
  const version = b.attrs.translation ? cut(b.attrs.translation, SLIDE_LIMITS.version) : null;
  const verses = b.attrs.verses
    .map((v) => ({ reference: verseReference(b.attrs.reference, v.number), text: collapse(v.text) }))
    .filter((v) => v.text);
  const subtitle = decision?.layout === 'M04' ? collapse(String(decision.text ?? '')) : '';
  const out: SlideItem[] = [];
  const m03 = fitContextTitle(context, SLIDE_MODEL_LIMITS.M03.title);
  const push = (text: string, reference: string, over: Partial<SlideItem> = {}) =>
    out.push({ ...base, id: `${id}:${out.length}`, kind: 'VERSE', sourceBlockId: id, text, reference, layout: 'M03', heading: m03, version, ...over });

  let first = 0;
  if (subtitle && verses.length > 0) {
    const m04 = wordCut(context, SLIDE_MODEL_LIMITS.M04.title);
    const sub = capText(subtitle, SLIDE_MODEL_LIMITS.M04.subtitle);
    if (m04 && verses[0].text.length <= SLIDE_MODEL_LIMITS.M04.verse) {
      push(verses[0].text, verses[0].reference, { layout: 'M04', heading: m04, subtitle: sub });
      first = 1;
    } else {
      const lead: SlideItem = {
        ...base, id: `${id}:lead`, kind: 'SUMMARY', sourceBlockId: id, text: capText(subtitle, SLIDE_MODEL_LIMITS.M02.subtitle),
        reference: null, layout: 'M02', heading: fitContextTitle(context, SLIDE_MODEL_LIMITS.M02.title),
      };
      const rest = versesM03();
      return rest.length > 0 ? [lead, ...rest] : [];
    }
  }
  return versesM03();

  function versesM03(): SlideItem[] {
    for (const v of verses.slice(first)) for (const text of splitVerse(v.text, SLIDE_MODEL_LIMITS.M03.verse)) push(text, v.reference);
    return out;
  }
}

export function buildSlides(title: string, doc: SermonDoc, mode: SlideMode, decisions?: Record<string, AiDecision>): SlideItem[] {
  const main: SlideItem[] = [];
  const privates: SlideItem[] = [];
  const targets = new Map(mode === 'FULL' && decisions ? aiTargets(doc).map((t) => [t.id, t]) : []);
  const decided = (id: string): AiDecision | undefined =>
    targets.has(id) && decisions && Object.prototype.hasOwnProperty.call(decisions, id) ? decisions[id] : undefined;
  const pushSummary = (id: string, context: string) => {
    const t = targets.get(id);
    const d = decided(id);
    const text = d ? collapse(String(d.text ?? '')) : '';
    if (!t || !SUMMARY_PARTS.includes(t.part) || !text) return;
    main.push({
      ...base,
      id,
      kind: 'SUMMARY',
      sourceBlockId: t.sourceBlockId,
      text: capText(text, SLIDE_MODEL_LIMITS.M02.subtitle),
      reference: null,
      layout: 'M02',
      heading: fitContextTitle(context || t.label, SLIDE_MODEL_LIMITS.M02.title),
    });
  };
  const trimmed = collapse(title);
  let point = ''; // texto do último Ponto: título de contexto de versículos, ilustrações e aplicações
  if (mode !== 'VERSES' && trimmed) main.push(...titleItems(trimmed));
  pushSummary(OPENING_ID, trimmed);
  for (const b of doc.content) {
    switch (b.type) {
      case 'privateNote': {
        const text = collapse(innerText(b.content));
        if (!text) break;
        privates.push({
          ...base,
          id: `${b.attrs.id}:0`,
          kind: 'PRIVATE',
          sourceBlockId: b.attrs.id,
          text: label(text, SLIDE_LIMITS.privateLabel),
          reference: null,
          included: false,
          layout: 'M01',
        });
        break;
      }
      case 'illustration':
      case 'application':
        pushSummary(`${b.attrs.id}:0`, point || trimmed);
        break;
      case 'heading':
        pushSummary(`${b.attrs.id}:0`, collapse(inlineText(b.content)));
        break;
      case 'point': {
        const text = collapse(inlineText(b.content));
        if (!text) break;
        point = text;
        if (mode !== 'VERSES') main.push(...pointItems(b.attrs.id, text, decided(`${b.attrs.id}:0`)));
        break;
      }
      case 'verse':
        main.push(...verseItems(b, point || trimmed || b.attrs.reference, decided(b.attrs.id)));
        break;
      default:
        break;
    }
  }
  return [...main.slice(0, SLIDE_LIMITS.items), ...privates].slice(0, SLIDE_LIMITS.items);
}

export function countSlides(title: string, doc: SermonDoc): { VERSES: number; VERSES_AND_POINTS: number; FULL: number } {
  const n = (mode: 'VERSES' | 'VERSES_AND_POINTS') => buildSlides(title, doc, mode).filter((s) => s.kind !== 'PRIVATE').length;
  const versesAndPoints = n('VERSES_AND_POINTS');
  return { VERSES: n('VERSES'), VERSES_AND_POINTS: versesAndPoints, FULL: versesAndPoints + summaryTargets(doc).length };
}

// ---- Partes pedidas à IA em "Slides completos" ----

export type SummaryTarget = {
  id: string; // id do slide: 'opening:0' ou `${blockId}:0`
  sourceBlockId: string | null; // null na Abertura
  part: 'OPENING' | 'ILLUSTRATION' | 'APPLICATION' | 'SECTION';
  label: string; // "Abertura", "Ilustração", "Aplicação", ou o texto do título de seção
  text: string; // o texto a resumir, sem nenhum bloco "Só para mim"
};

export type AiTarget = {
  id: string; // resumo: id do slide ('opening:0', `${blockId}:0`); ponto: `${pointId}:0`; versículo: o id do BLOCO
  sourceBlockId: string | null;
  part: SummaryTarget['part'] | 'POINT' | 'VERSE';
  label: string; // rótulo da parte; no POINT o título do ponto; no VERSE a referência
  text: string; // texto de contexto (no VERSE, o texto bíblico, só para leitura)
};
/** O que a IA decidiu para um alvo. `text` = subtítulo/frase; '' quando o modelo não tem. */
export type AiDecision = { layout: SlideLayout; text: string };

export const SUMMARY_MAX = 90;
const SUMMARY_SOURCE = { chars: 6000, targets: 60, sectionWords: 12, blockWords: 6, verseWords: 1 } as const;
const OPENING_ID = 'opening:0';
const SUMMARY_PARTS: AiTarget['part'][] = ['OPENING', 'ILLUSTRATION', 'APPLICATION', 'SECTION'];

/** Pedaços separados por espaço que têm letra ou dígito (mesma regra de sermon-derive). */
function countWords(text: string): number {
  let n = 0;
  for (const piece of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(piece)) n++;
  return n;
}

/**
 * Todas as partes que podem ir à IA, na ordem do documento, só blocos de primeiro nível. Seção nova em cada `point`
 * e em cada `heading` nível 2; a Abertura é o que vem antes da primeira seção. Abertura, seção com título e Ponto
 * levam o texto dos parágrafos e listas deles; Ilustração e Aplicação, o próprio conteúdo; Versículo, o texto
 * bíblico. `privateNote` nunca entra.
 */
function collectTargets(doc: SermonDoc, keep: (part: AiTarget['part']) => boolean): AiTarget[] {
  type Entry = Omit<AiTarget, 'text'> & { chunks: string[]; minWords: number };
  const entries: Entry[] = [];
  let section: Entry | null = { id: OPENING_ID, sourceBlockId: null, part: 'OPENING', label: 'Abertura', chunks: [], minWords: SUMMARY_SOURCE.sectionWords };
  entries.push(section);
  for (const b of doc.content) {
    switch (b.type) {
      case 'point': {
        const title = collapse(inlineText(b.content));
        section = title
          ? { id: `${b.attrs.id}:0`, sourceBlockId: b.attrs.id, part: 'POINT', label: title, chunks: [], minWords: SUMMARY_SOURCE.sectionWords }
          : null;
        if (section) entries.push(section);
        break;
      }
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
      case 'verse':
        entries.push({
          id: b.attrs.id,
          sourceBlockId: b.attrs.id,
          part: 'VERSE',
          label: b.attrs.reference,
          chunks: b.attrs.verses.map((v) => v.text),
          minWords: SUMMARY_SOURCE.verseWords,
        });
        break;
      default: // privateNote: fora do texto
        break;
    }
  }
  const out: AiTarget[] = [];
  for (const { chunks, minWords, ...rest } of entries) {
    if (!keep(rest.part)) continue;
    const text = collapse(chunks.join(' '));
    if (countWords(text) < minWords) continue;
    out.push({ ...rest, text: cut(text, SUMMARY_SOURCE.chars) });
    if (out.length >= SUMMARY_SOURCE.targets) break;
  }
  return out;
}

/** Partes a resumir (Abertura, Ilustração, Aplicação, seção). Pontos e versículos não entram. */
export function summaryTargets(doc: SermonDoc): SummaryTarget[] {
  return collectTargets(doc, (part) => SUMMARY_PARTS.includes(part)) as SummaryTarget[];
}

/** Tudo o que vai à IA em "Slides completos": os alvos de resumo, cada Ponto com texto e cada Versículo. */
export function aiTargets(doc: SermonDoc): AiTarget[] {
  return collectTargets(doc, () => true);
}

const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»' };
const MODEL_CODES: Record<string, SlideLayout> = { '01': 'M01', '02': 'M02', '03': 'M03', '04': 'M04', M01: 'M01', M02: 'M02', M03: 'M03', M04: 'M04' };

/** Uma linha, sem aspas em volta, até 90 cortada num espaço. */
function cleanSentence(raw: unknown): string {
  let text = collapse(String(raw ?? ''));
  // Só tira o par de fora quando a mesma aspa não aparece dentro: '"A" e "B"' fica como está.
  while (text.length >= 2 && QUOTE_PAIRS[text[0]] === text[text.length - 1]) {
    const inner = text.slice(1, -1);
    if (inner.includes(text[0]) || inner.includes(text[text.length - 1])) break;
    text = inner.trim();
  }
  if (text.length === 1 && QUOTE_PAIRS[text]) text = '';
  const chars = Array.from(text);
  if (chars.length > SUMMARY_MAX) {
    const head = chars.slice(0, SUMMARY_MAX + 1).join('');
    const at = head.lastIndexOf(' ');
    text = (at > 0 ? head.slice(0, at) : chars.slice(0, SUMMARY_MAX).join('')).trimEnd();
  }
  return text;
}

/**
 * Decisões devolvidas pelo modelo: só ids de `targets` (o primeiro de cada). Modelo permitido por parte: resumos
 * sempre 02; Ponto 01 ou 02; Versículo 03 ou 04; outro valor vira o padrão. 02/04 sem texto rebaixam para 01/03;
 * resumo sem texto é descartado. Nada aqui carrega texto bíblico: o versículo só ganha (ou não) um subtítulo.
 */
export function cleanDecisions(targets: AiTarget[], raw: { id: string; model: string; text: string }[]): Record<string, AiDecision> {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: Record<string, AiDecision> = {};
  for (const r of raw) {
    const t = byId.get(r.id);
    if (!t || seen.has(r.id)) continue;
    seen.add(r.id);
    const text = cleanSentence(r.text);
    const asked = MODEL_CODES[String(r.model ?? '').trim().toUpperCase()];
    if (SUMMARY_PARTS.includes(t.part)) {
      if (text) out[r.id] = { layout: 'M02', text };
    } else if (t.part === 'POINT') {
      out[r.id] = asked === 'M02' && text ? { layout: 'M02', text } : { layout: 'M01', text: '' };
    } else {
      out[r.id] = asked === 'M04' && text ? { layout: 'M04', text } : { layout: 'M03', text: '' };
    }
  }
  return out;
}

export function mergeSlides(previous: SlideItem[], fresh: SlideItem[]): SlideItem[] {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  const freshById = new Map(fresh.map((f) => [f.id, f]));
  const merge = (f: SlideItem): SlideItem => {
    const p = prevById.get(f.id);
    if (!p) return f;
    let next: SlideItem = { ...f, included: f.kind === 'PRIVATE' ? false : p.included };
    if (p.kind !== f.kind) return next;
    // Texto editado fica (nunca no VERSE, que vem sempre do bloco), se ainda couber no modelo.
    if (p.edited && f.kind !== 'VERSE') {
      const withText = { ...next, text: p.text, edited: true };
      if (textFits(withText)) next = withText;
    }
    // Subtítulo editado fica com o seu modelo, se couber junto do texto que ficou.
    if (p.subtitleEdited && (f.kind === 'POINT' || f.kind === 'VERSE')) {
      const withSub = { ...next, subtitle: p.subtitle, layout: p.layout, subtitleEdited: true };
      if (subtitleFits(withSub)) next = withSub;
      else if (!subtitleFits(next)) next = { ...next, subtitle: null, layout: DEFAULT_LAYOUT[f.kind] };
    }
    return coherent(next);
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

/** Slides públicos de uma face, já divididos nos limites; `text` acompanha o pedaço (título ou frase). */
export function publicFaces(kind: PublicSlide['kind'], text: string, face: SlideFace): PublicSlide[] {
  const faces = splitFaceForLimits(face);
  if (faces.length === 1) return [{ kind, text, ...face }];
  return faces.map((f) => ({ kind, text: kind === 'SUMMARY' ? (f.subtitle ?? text) : kind === 'VERSE' ? text : f.title, ...f }));
}

export function publicSlides(items: SlideItem[]): PublicSlide[] {
  const out: PublicSlide[] = [];
  for (const s of items) {
    if (s.included && s.kind !== 'PRIVATE') out.push(...publicFaces(s.kind, s.text, slideFace(s)));
  }
  return out;
}

const optionalText = (v: unknown) => v === undefined || v === null || typeof v === 'string';

/** Lê a coluna Json; o que estiver fora do formato é descartado. Itens gravados antes dos modelos recebem o padrão. */
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
      !(o.layout === undefined || SLIDE_LAYOUTS.includes(o.layout as SlideLayout)) ||
      !optionalText(o.heading) || !optionalText(o.subtitle) || !optionalText(o.version) ||
      ids.has(o.id)
    ) continue;
    ids.add(o.id);
    const kind = o.kind as SlideKind;
    const text = (k: string, max: number) => (typeof o[k] === 'string' && o[k] ? cut(o[k] as string, max) : null);
    out.push(
      coherent({
        id: o.id,
        kind,
        sourceBlockId: o.sourceBlockId as string | null,
        text: kind === 'VERSE' ? o.text : cut(o.text, SLIDE_LIMITS.textChars),
        reference: o.reference as string | null,
        included: kind === 'PRIVATE' ? false : o.included,
        edited: o.edited,
        subtitleEdited: o.subtitleEdited === true,
        layout: (o.layout as SlideLayout | undefined) ?? DEFAULT_LAYOUT[kind],
        heading: text('heading', SLIDE_MODEL_LIMITS.M02.title),
        subtitle: text('subtitle', SLIDE_MODEL_LIMITS.M02.subtitle),
        version: kind === 'VERSE' ? text('version', SLIDE_LIMITS.version) : null,
      }),
    );
    if (out.length >= SLIDE_LIMITS.items) break;
  }
  return out;
}
