// Slides da Palavra tirados do esboço: um slide por tópico, na identidade "painel" (docs/identidade-slides.md).
//
// Este arquivo é copiado tal qual para o painel (apps/admin/src/features/sermons/lib/slides.ts). Por isso não tem
// nenhuma importação de código, só de tipos: o que depende da API (como a troca de "(Gn 37:5)" por
// "(Gênesis 37:5)") chega por parâmetro.
import type { Inline, Inner, SermonBlock, SermonDoc } from './sermon-document';

// ---- Tipos ----------------------------------------------------------------------------------------------------

/** Modos de geração: "Com versículos" (VERSES_AND_POINTS) e "Só títulos" (TITLES). */
export type SlideMode = 'VERSES_AND_POINTS' | 'TITLES';
/** O que pode estar gravado na coluna: VERSES e FULL vêm de gerações antigas e valem como VERSES_AND_POINTS. */
export type StoredSlideMode = SlideMode | 'VERSES' | 'FULL';
export const SLIDE_MODES: SlideMode[] = ['VERSES_AND_POINTS', 'TITLES'];
export type SlideStyle = 'MINIMAL' | 'BACKGROUND';
export type SlideKind = 'TITLE' | 'VERSE' | 'POINT' | 'SUMMARY' | 'PRIVATE';
/**
 * Composição do slide:
 * - TITLE: só o título e o traço, sem painel (capa sem versículo, ponto só com título, anotação privada);
 * - VERSE: título, traço e painel com aspa, versículo e referência;
 * - NUMBERED: título, traço e painel com lista numerada (visão geral);
 * - BULLETS: título, traço e painel com lista com marcadores.
 */
export type SlideLayout = 'TITLE' | 'VERSE' | 'NUMBERED' | 'BULLETS';
export const SLIDE_LAYOUTS: SlideLayout[] = ['TITLE', 'VERSE', 'NUMBERED', 'BULLETS'];

/**
 * Um slide gravado na palavra.
 *
 * | Slide                         | kind    | layout   | text                   | heading                | items            |
 * | Capa sem versículo            | TITLE   | TITLE    | título da palavra      | null                   | null             |
 * | Versículo (capa ou de ponto)  | VERSE   | VERSE    | o pedaço do versículo  | título do contexto     | null             |
 * | Ponto só com título           | POINT   | TITLE    | "n. Título"            | null                   | null             |
 * | Visão geral                   | SUMMARY | NUMBERED | itens unidos por "\n"  | título da palavra      | títulos sem número |
 * | Lista com marcadores          | SUMMARY | BULLETS  | itens unidos por "\n"  | título do contexto     | itens            |
 * | Anotação "Só para mim"        | PRIVATE | TITLE    | rótulo                 | null                   | null             |
 */
export type SlideItem = {
  /** 'title' | 'overview' | 'overview:n' | `${pointId}:title` | `${verseBlockId}:n` | `list:${contexto}:k:n` | `${noteId}:0` */
  id: string;
  kind: SlideKind;
  sourceBlockId: string | null;
  text: string;
  reference: string | null; // só VERSE: "Livro c:v"
  included: boolean;
  edited: boolean; // o pregador mudou o `text` (só TITLE e POINT)
  layout: SlideLayout;
  heading: string | null; // título do slide em VERSE e SUMMARY
  items: string[] | null; // só SUMMARY
  /** Só NUMBERED: o número do primeiro item (1, ou o seguinte quando a visão geral é dividida em mais slides). */
  start: number | null;
  version: string | null; // só VERSE: código da tradução do bloco (guardado, não aparece na tela)
};

/** O que a tela mostra. `title` é o título do slide (o heading, ou o texto em TITLE/POINT). */
export type SlideFace = {
  layout: SlideLayout;
  title: string;
  verse: string | null;
  reference: string | null;
  items: string[] | null;
  start: number | null;
};
/** O que vai para o envio (Ponte e Cultos). `kind`, `text` e `reference` são o contrato antigo; SUMMARY leva os itens em `text`, separados por "\n". */
export type PublicSlide = { kind: Exclude<SlideKind, 'PRIVATE'>; text: string; reference: string | null } & SlideFace;

export const SLIDE_LIMITS = {
  textChars: 300, // texto de um slide, item de lista e título de contexto
  editableText: 120, // título de Capa e Ponto editado à mão
  items: 400, // slides por palavra
  listItems: 100, // itens numa lista
  privateLabel: 80,
  version: 36,
} as const;

// ---- Medidas da identidade (px numa tela 1920×1080) -------------------------------------------------------------

/**
 * Medidas de docs/identidade-slides.md, usadas pelo gerador (para caber) e pelo desenho (prévia e .pptx).
 * A estimativa é por caracteres, com quebra em palavra inteira; a fonte nunca encolhe: o que não cabe vai para
 * outro slide.
 */
export const PANEL = {
  canvas: { width: 1920, height: 1080 },
  margin: { x: 128, y: 96 },
  /** Área útil: 1920 − 2×128 por 1080 − 2×96. */
  area: { width: 1664, height: 888 },
  /** Título: Montserrat 800, até 26 caracteres por linha. */
  title: { size: 104, weight: 800, lineHeight: 1.1, line: 114.4, chars: 26 },
  /** Traço dourado abaixo do título; `gap` vale entre título e traço e entre traço e painel. */
  rule: { width: 120, height: 6, radius: 3, gap: 36 },
  /** Título → traço → painel: 36 + 6 + 36. */
  header: 78,
  /** Painel: x = (1920 − 1500) / 2; respiro de 56 em cima e embaixo e 96 nas laterais (1308 de largura útil). */
  panel: { x: 210, width: 1500, radius: 28, border: 2, padY: 56, padX: 96, innerWidth: 1308 },
  /** Aspa “ dourada: fonte de 120, numa caixa de 60 de altura, e 24 até o texto. */
  quote: { size: 120, weight: 800, height: 60, gap: 24 },
  /** Versículo: Montserrat 500, até 44 caracteres por linha. */
  verse: { size: 54, weight: 500, lineHeight: 1.45, line: 78.3, chars: 44 },
  /** Referência dourada em negrito, com 2 px entre letras: 24 de espaço acima e 46 de altura. */
  reference: { size: 38, weight: 700, letterSpacing: 2, gap: 24, height: 46 },
  /** Mensagem / tópico em destaque (ainda não usada pelo gerador). */
  message: { size: 72, weight: 700, lineHeight: 1.3, line: 93.6 },
  /** Lista com marcadores: item em 500, até 48 caracteres por linha, 16 entre itens. */
  bullets: { size: 46, weight: 500, lineHeight: 1.4, line: 64.4, chars: 48, gap: 16 },
  /** Lista numerada: número em 800 e item em 600, até 46 caracteres por linha, 12 entre itens. */
  numbered: { size: 44, weight: 600, lineHeight: 1.25, line: 55, chars: 46, gap: 12 },
  /** Um versículo nunca é dividido em pedaços de menos de 2 linhas. */
  minLines: 2,
} as const;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const cut = (s: string, max: number) => Array.from(s).slice(0, max).join('');
const EPSILON = 1e-9;

/** Quebra em linhas de até `chars` caracteres, em palavra inteira; palavra maior que a linha é cortada. */
/** Até quantos caracteres um trecho entre parênteses fica inteiro numa linha (ex.: "(1 Reis 3:5)"). */
const KEEP_TOGETHER = 24;

/** As palavras do texto; um trecho curto entre parênteses conta como uma palavra só, para não quebrar no meio. */
function wrapTokens(text: string): string[] {
  const tokens: string[] = [];
  const words = collapse(text).split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let token = words[i];
    if (token.startsWith('(') && !token.includes(')')) {
      let j = i + 1;
      let joined = token;
      while (j < words.length && !joined.includes(')') && Array.from(joined).length <= KEEP_TOGETHER) joined += ` ${words[j++]}`;
      if (joined.includes(')') && Array.from(joined).length <= KEEP_TOGETHER) {
        token = joined;
        i = j - 1;
      }
    }
    tokens.push(token);
  }
  return tokens;
}

/** Aspas retas viram tipográficas (manual, "Regras de texto"): abre no começo ou depois de espaço/parêntese. */
export function typographicQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{—–-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{—–-])'/g, '$1‘')
    .replace(/'/g, '’');
}

export function wrapLines(text: string, chars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (let word of wrapTokens(text)) {
    if (!word) continue;
    while (Array.from(word).length > chars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(cut(word, chars));
      word = Array.from(word).slice(chars).join('');
    }
    if (!word) continue;
    if (!current) current = word;
    else if (Array.from(current).length + 1 + Array.from(word).length <= chars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Linhas do título do slide (0 sem título). */
export function titleLines(title: string | null): number {
  return title ? wrapLines(title, PANEL.title.chars).length : 0;
}

/** Altura livre dentro do painel, descontados o título, o traço e o respiro do painel. */
export function panelSpace(title: string | null): number {
  return PANEL.area.height - titleLines(title) * PANEL.title.line - PANEL.header - 2 * PANEL.panel.padY;
}

/** Linhas de versículo que cabem no painel abaixo deste título (no mínimo 2). */
export function verseLinesAvailable(title: string | null): number {
  const fixed = PANEL.quote.height + PANEL.quote.gap + PANEL.reference.gap + PANEL.reference.height;
  return Math.max(PANEL.minLines, Math.floor((panelSpace(title) - fixed) / PANEL.verse.line + EPSILON));
}

/** Linhas que o texto do versículo ocupa. */
export function verseLines(text: string): number {
  return wrapLines(text, PANEL.verse.chars).length;
}

const SENTENCE_END = /[.;:?!]["'”’)\]]*$/;
const COMMA_END = /,["'”’)\]]*$/;

/**
 * Divide o versículo em pedaços de até `maxLines` linhas: primeiro na última fronteira de frase (. ; : ? !) que
 * caiba, depois na última vírgula, por fim na última palavra que caiba. Junto, os pedaços são o texto (espaços
 * colapsados).
 */
export function splitVerseToFit(text: string, maxLines: number): string[] {
  let rest = collapse(text).split(' ').filter(Boolean);
  const fits = (words: string[]) => verseLines(words.join(' ')) <= maxLines;
  const lastEnd = (words: string[], n: number, re: RegExp) => {
    for (let i = n; i >= 1; i--) if (re.test(words[i - 1])) return i;
    return 0;
  };
  const pieces: string[] = [];
  while (rest.length > 0) {
    if (fits(rest)) {
      pieces.push(rest.join(' '));
      break;
    }
    let n = 0;
    while (n < rest.length && fits(rest.slice(0, n + 1))) n++;
    if (n === 0) n = 1; // palavra que sozinha passa do limite vai inteira
    const at = lastEnd(rest, n, SENTENCE_END) || lastEnd(rest, n, COMMA_END) || n;
    pieces.push(rest.slice(0, at).join(' '));
    rest = rest.slice(at);
  }
  return pieces;
}

/** Altura de uma lista no painel: linhas de cada item mais o espaço entre itens. */
export function listHeight(items: string[], layout: 'NUMBERED' | 'BULLETS'): number {
  const spec = layout === 'NUMBERED' ? PANEL.numbered : PANEL.bullets;
  if (items.length === 0) return 0;
  const lines = items.reduce((n, item) => n + Math.max(1, wrapLines(item, spec.chars).length), 0);
  return lines * spec.line + (items.length - 1) * spec.gap;
}

/** Divide a lista entre itens, para cada grupo caber no painel abaixo do título. Item que sozinho não cabe vai inteiro num grupo. */
export function splitListToFit(items: string[], layout: 'NUMBERED' | 'BULLETS', title: string | null): string[][] {
  const space = panelSpace(title) + EPSILON;
  const groups: string[][] = [];
  let current: string[] = [];
  for (const item of items) {
    if (current.length > 0 && listHeight([...current, item], layout) > space) {
      groups.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// ---- Leitura do documento ---------------------------------------------------------------------------------------

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

/** Tira uma numeração que o pregador já escreveu: "1.", "1)", "1 –", "I –", "IV.", "Ponto 1:". */
export function stripPointNumber(text: string): string {
  const t = collapse(text);
  const stripped = t
    .replace(/^ponto\s+\d+\s*[:.)–—-]?\s*/i, '')
    .replace(/^\d+\s*[.)]\s*|^\d+\s*[–—-]\s+/, '')
    .replace(/^[IVXLC]+\s*[.)–—-]\s+/, '');
  return stripped || t;
}

/** Referência do versículo `number` dentro da referência do bloco ("Mateus 7:9-11" + 9 → "Mateus 7:9"). */
function verseReference(blockRef: string, number: number | null): string {
  const m = /^(.*\d+):\d+(?:-\d+)?$/.exec(blockRef);
  return m && number !== null ? `${m[1]}:${number}` : blockRef;
}

/** Troca cada trecho entre parênteses que `normalizeRef` reconhece pela forma completa: "(Gn 37:5)" → "(Gênesis 37:5)". */
function normalizeRefs(text: string, normalizeRef?: (s: string) => string | null): string {
  if (!normalizeRef) return text;
  return text.replace(/\(([^()]+)\)/g, (whole, inner: string) => {
    const ref = normalizeRef(inner.trim());
    return ref ? `(${ref})` : whole;
  });
}

function label(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('').trim()}…` : text;
}

type VerseBlock = Extract<SermonBlock, { type: 'verse' }>;
type ListBlock = Extract<SermonBlock, { type: 'bulletList' | 'orderedList' }>;

/** Um trecho do documento com o mesmo título de slide: a abertura, cada ponto e cada título de seção. */
type Context = {
  kind: 'OPENING' | 'POINT' | 'SECTION';
  key: string; // 'opening', o id do ponto ou o id do título
  heading: string; // '' na abertura sem título da palavra
  pointTitle: string; // ponto: o título sem numeração (vai na visão geral)
  blocks: (VerseBlock | ListBlock)[];
};

const blank = { included: true, edited: false, heading: null, items: null, start: null, version: null, reference: null } as const;

function verseItems(b: VerseBlock, heading: string | null): SlideItem[] {
  const id = b.attrs.id;
  const version = b.attrs.translation ? cut(b.attrs.translation, SLIDE_LIMITS.version) : null;
  const maxLines = verseLinesAvailable(heading ?? b.attrs.reference);
  const out: SlideItem[] = [];
  for (const v of b.attrs.verses) {
    const reference = verseReference(b.attrs.reference, v.number);
    for (const text of splitVerseToFit(typographicQuotes(v.text), maxLines)) {
      out.push({ ...blank, id: `${id}:${out.length}`, kind: 'VERSE', sourceBlockId: id, text, reference, layout: 'VERSE', heading, version });
    }
  }
  return out;
}

/** O texto de cada item (primeiro parágrafo, sem sublistas), com as referências entre parênteses completas. */
function listTexts(b: ListBlock, normalizeRef?: (s: string) => string | null): string[] {
  const out: string[] = [];
  for (const li of b.content) {
    const first = li.content.find((c) => c.type === 'paragraph');
    const text = first ? collapse(inlineText(first.type === 'paragraph' ? first.content : undefined)) : '';
    if (text) out.push(cut(typographicQuotes(normalizeRefs(text, normalizeRef)), SLIDE_LIMITS.textChars));
    if (out.length >= SLIDE_LIMITS.listItems) break;
  }
  return out;
}

function summaryItems(idFor: (n: number) => string, items: string[], layout: 'NUMBERED' | 'BULLETS', heading: string | null): SlideItem[] {
  let start = 1;
  return splitListToFit(items, layout, heading).map((group, n) => {
    const item: SlideItem = {
      ...blank,
      id: idFor(n),
      kind: 'SUMMARY',
      sourceBlockId: null,
      text: group.join('\n'),
      layout,
      heading,
      items: group,
      start: layout === 'NUMBERED' ? start : null,
    };
    start += group.length;
    return item;
  });
}

// ---- Geração ----------------------------------------------------------------------------------------------------

/**
 * Os slides da palavra.
 * - Capa: em "Com versículos", os versículos da abertura (com o título da palavra no alto); senão, o título.
 * - Visão geral (com 2 pontos ou mais): a lista numerada dos pontos.
 * - Em "Com versículos", os versículos e as listas de cada ponto ou seção, com "n. Título" no alto; ponto sem
 *   nenhum deles vira um slide só com o título. Em "Só títulos", um slide com o título de cada ponto.
 * - Parágrafo, ilustração e aplicação não viram slide. As anotações "Só para mim" vão no fim, desmarcadas.
 * `normalizeRef` (opcional) completa as referências entre parênteses nos itens de lista.
 */
export function buildSlides(title: string, doc: SermonDoc, mode: SlideMode, normalizeRef?: (s: string) => string | null): SlideItem[] {
  const trimmed = cut(collapse(title), SLIDE_LIMITS.textChars);
  const contexts: Context[] = [{ kind: 'OPENING', key: 'opening', heading: trimmed, pointTitle: '', blocks: [] }];
  const privates: SlideItem[] = [];
  let points = 0;
  for (const b of doc.content) {
    const ctx = contexts[contexts.length - 1];
    switch (b.type) {
      case 'point': {
        const text = cut(stripPointNumber(inlineText(b.content)), SLIDE_LIMITS.textChars);
        if (!text) break;
        points++;
        contexts.push({ kind: 'POINT', key: b.attrs.id, heading: `${points}. ${text}`, pointTitle: text, blocks: [] });
        break;
      }
      case 'heading': {
        const text = cut(collapse(inlineText(b.content)), SLIDE_LIMITS.textChars);
        if (text) contexts.push({ kind: 'SECTION', key: b.attrs.id, heading: text, pointTitle: '', blocks: [] });
        break;
      }
      case 'verse':
      case 'bulletList':
      case 'orderedList':
        ctx.blocks.push(b);
        break;
      case 'privateNote': {
        const text = collapse(innerText(b.content));
        if (!text) break;
        privates.push({
          ...blank,
          id: `${b.attrs.id}:0`,
          kind: 'PRIVATE',
          sourceBlockId: b.attrs.id,
          text: label(text, SLIDE_LIMITS.privateLabel),
          included: false,
          layout: 'TITLE',
        });
        break;
      }
      default: // parágrafo, ilustração, aplicação: nenhum slide
        break;
    }
  }

  const withVerses = mode === 'VERSES_AND_POINTS';
  const pointContexts = contexts.filter((c) => c.kind === 'POINT');
  const hasOverview = pointContexts.length >= 2;

  /** Os slides de versículo e de lista de um contexto, na ordem do documento. */
  const contentOf = (ctx: Context, only?: 'verse' | 'list'): SlideItem[] => {
    const out: SlideItem[] = [];
    const heading = ctx.heading || null;
    let k = 0;
    for (const b of ctx.blocks) {
      if (b.type === 'verse') {
        if (only !== 'list') out.push(...verseItems(b, heading));
      } else {
        const index = k++;
        if (only === 'verse') continue;
        const texts = listTexts(b, normalizeRef);
        if (texts.length > 0) out.push(...summaryItems((n) => `list:${ctx.key}:${index}:${n}`, texts, 'BULLETS', heading));
      }
    }
    return out;
  };

  const main: SlideItem[] = [];
  const [opening, ...rest] = contexts;
  // Capa
  const cover = withVerses ? contentOf(opening, 'verse') : [];
  if (cover.length > 0) main.push(...cover);
  else if (trimmed) main.push({ ...blank, id: 'title', kind: 'TITLE', sourceBlockId: null, text: trimmed, layout: 'TITLE' });
  // Visão geral
  if (hasOverview) {
    const titles = pointContexts.map((c) => c.pointTitle);
    main.push(...summaryItems((n) => (n === 0 ? 'overview' : `overview:${n}`), titles, 'NUMBERED', trimmed || null));
  }
  // A lista da abertura é a própria visão geral quando ela existe.
  if (withVerses && !hasOverview) main.push(...contentOf(opening, 'list'));
  // Pontos e seções
  for (const ctx of rest) {
    const content = withVerses ? contentOf(ctx) : [];
    if (content.length > 0) main.push(...content);
    else if (ctx.kind === 'POINT') {
      main.push({ ...blank, id: `${ctx.key}:title`, kind: 'POINT', sourceBlockId: ctx.key, text: ctx.heading, layout: 'TITLE' });
    }
  }
  return [...main.slice(0, SLIDE_LIMITS.items), ...privates].slice(0, SLIDE_LIMITS.items);
}

/** Quantos slides cada modo gera (sem as anotações privadas). */
export function countSlides(title: string, doc: SermonDoc): { VERSES_AND_POINTS: number; TITLES: number } {
  const n = (mode: SlideMode) => buildSlides(title, doc, mode).filter((s) => s.kind !== 'PRIVATE').length;
  return { VERSES_AND_POINTS: n('VERSES_AND_POINTS'), TITLES: n('TITLES') };
}

/** O modo gravado lido como modo de hoje: VERSES e FULL (gerações antigas) valem como "Com versículos". */
export function readSlideMode(mode: StoredSlideMode | null): SlideMode | null {
  if (mode === null) return null;
  return mode === 'TITLES' ? 'TITLES' : 'VERSES_AND_POINTS';
}

// ---- Face, merge e leitura do que está gravado -----------------------------------------------------------------------

const KINDS: SlideKind[] = ['TITLE', 'VERSE', 'POINT', 'SUMMARY', 'PRIVATE'];
const linesOf = (text: string) => text.split('\n').map(collapse).filter(Boolean);

/** Deixa o item coerente com o tipo: layout, heading, itens, número inicial e versão de cada um. */
function coherent(s: SlideItem): SlideItem {
  switch (s.kind) {
    case 'VERSE':
      return { ...s, layout: 'VERSE', items: null, start: null };
    case 'SUMMARY': {
      const layout = s.layout === 'NUMBERED' ? 'NUMBERED' : 'BULLETS';
      const items = s.items && s.items.length > 0 ? s.items : linesOf(s.text);
      return {
        ...s,
        layout,
        items,
        text: items.join('\n'),
        reference: null,
        version: null,
        start: layout === 'NUMBERED' ? (s.start ?? 1) : null,
      };
    }
    default: // TITLE, POINT, PRIVATE
      return { ...s, layout: 'TITLE', heading: null, items: null, start: null, version: null };
  }
}

export type SlideFaceInput = Pick<SlideItem, 'kind' | 'text' | 'reference'> & Partial<Pick<SlideItem, 'layout' | 'heading' | 'items' | 'start'>>;

/** O que a tela mostra. Item sem `layout` (ou com um antigo) recebe o padrão do tipo. */
export function slideFace(input: SlideFaceInput): SlideFace {
  const s = coherent({
    ...blank,
    id: '',
    sourceBlockId: null,
    kind: input.kind,
    text: input.text,
    reference: input.reference,
    layout: input.layout && SLIDE_LAYOUTS.includes(input.layout) ? input.layout : input.kind === 'VERSE' ? 'VERSE' : 'TITLE',
    heading: input.heading ?? null,
    items: input.items ?? null,
    start: input.start ?? null,
  });
  if (s.kind === 'VERSE') {
    return { layout: 'VERSE', title: s.heading || s.reference || '', verse: s.text, reference: s.reference, items: null, start: null };
  }
  if (s.kind === 'SUMMARY') return { layout: s.layout, title: s.heading ?? '', verse: null, reference: null, items: s.items, start: s.start };
  return { layout: 'TITLE', title: s.text, verse: null, reference: null, items: null, start: null };
}

/** O texto editável (Capa e Ponto) cabe no limite? */
export function editableTextFits(text: string): boolean {
  return Array.from(text).length <= SLIDE_LIMITS.editableText;
}

/**
 * Junta a geração nova com a gravada, pelo id: fica o `included` de cada slide e o texto editado de Capa e Ponto
 * (se ainda couber). A ordem gravada fica; slides novos entram depois do vizinho anterior. Privados vão no fim.
 */
export function mergeSlides(previous: SlideItem[], fresh: SlideItem[]): SlideItem[] {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  const freshById = new Map(fresh.map((f) => [f.id, f]));
  const merge = (f: SlideItem): SlideItem => {
    const p = prevById.get(f.id);
    if (!p) return f;
    const next: SlideItem = { ...f, included: f.kind === 'PRIVATE' ? false : p.included };
    if (p.kind === f.kind && p.edited && (f.kind === 'TITLE' || f.kind === 'POINT') && editableTextFits(p.text)) {
      return { ...next, text: p.text, edited: true };
    }
    return next;
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

/** Os slides que vão para o envio: marcados e não privados. */
export function publicSlides(items: SlideItem[]): PublicSlide[] {
  const out: PublicSlide[] = [];
  for (const s of items) {
    if (s.included && s.kind !== 'PRIVATE') out.push({ kind: s.kind, text: s.text, ...slideFace(s) });
  }
  return out;
}

const optionalText = (v: unknown) => v === undefined || v === null || typeof v === 'string';

/**
 * Lê a coluna Json; o que estiver fora do formato é descartado. Linhas antigas (modelos M01–M04, `subtitle`)
 * são aceitas: layout desconhecido vira o padrão do tipo (SUMMARY vira lista com um item), `subtitle` é ignorado e
 * o heading que falta vira a referência (VERSE) ou ''.
 */
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
      !optionalText(o.heading) || !optionalText(o.version) ||
      ids.has(o.id)
    ) continue;
    ids.add(o.id);
    const kind = o.kind as SlideKind;
    const items = Array.isArray(o.items)
      ? o.items.filter((x): x is string => typeof x === 'string' && collapse(x) !== '').slice(0, SLIDE_LIMITS.listItems).map((x) => cut(x, SLIDE_LIMITS.textChars))
      : null;
    const heading = typeof o.heading === 'string' ? cut(o.heading, SLIDE_LIMITS.textChars) : null;
    out.push(
      coherent({
        id: o.id,
        kind,
        sourceBlockId: o.sourceBlockId as string | null,
        text: kind === 'VERSE' ? o.text : cut(o.text, kind === 'SUMMARY' ? SLIDE_LIMITS.textChars * SLIDE_LIMITS.listItems : SLIDE_LIMITS.textChars),
        reference: kind === 'VERSE' ? (o.reference as string | null) : null,
        included: kind === 'PRIVATE' ? false : o.included,
        edited: o.edited,
        layout: SLIDE_LAYOUTS.includes(o.layout as SlideLayout) ? (o.layout as SlideLayout) : kind === 'VERSE' ? 'VERSE' : 'BULLETS',
        heading: heading ?? (kind === 'VERSE' ? (o.reference as string | null) ?? '' : kind === 'SUMMARY' ? '' : null),
        items: items && items.length > 0 ? items : null,
        start: typeof o.start === 'number' && Number.isInteger(o.start) && o.start >= 1 ? o.start : null,
        version: kind === 'VERSE' && typeof o.version === 'string' && o.version ? cut(o.version, SLIDE_LIMITS.version) : null,
      }),
    );
    if (out.length >= SLIDE_LIMITS.items) break;
  }
  return out;
}
