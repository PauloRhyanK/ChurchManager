// Geometria pura de um slide na identidade visual: a prévia e a apresentação desenham a partir daqui.
// Tudo em pixels numa tela de 1920×1080. Números em slide-identity.ts.
import {
  SLIDE_CANVAS,
  SLIDE_FONT_SIZES,
  SLIDE_GLYPH_WIDTH,
  SLIDE_LEFT_ALIGN_OVER,
  SLIDE_LINE_HEIGHT,
  SLIDE_OPTICAL_SHIFT,
  SLIDE_SAFE_AREA,
  SLIDE_SPACING,
  SLIDE_THEMES,
  SLIDE_TITLE_VERSE_MAX_GAP,
  SLIDE_TRACKING,
  SLIDE_WEIGHTS,
  type FontRange,
} from "./slide-identity";
import { SLIDE_MODEL_LIMITS, type SlideFace, type SlideLayout, type SlideStyle } from "./slides";

export type SlideBlock = {
  role: "title" | "subtitle" | "verse" | "reference";
  text: string;
  fontFamily: "title" | "body";
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  italic: boolean;
  tracking: number; // em milésimos de em (ex.: -70)
  lineHeight: number;
  align: "center" | "left";
  x: number;
  y: number;
  width: number;
  height: number; // caixa estimada, para a exportação
  gapBefore: number; // espaço até o bloco anterior, para a prévia
  /** Linhas estimadas (no texto cortado, as que ficam). */
  maxLines: number;
  /** Só texto acima do limite do modelo: a prévia corta em `maxLines` linhas. Dentro do limite nada é cortado. */
  clamped: boolean;
};

export type SlideDrawing = {
  width: 1920;
  height: 1080;
  background: string;
  color: string;
  layout: SlideLayout;
  align: "center" | "left";
  blocks: SlideBlock[];
};

type Role = SlideBlock["role"];

const ROLES: Record<SlideLayout, Role[]> = {
  M01: ["title"],
  M02: ["title", "subtitle"],
  M03: ["title", "verse", "reference"],
  M04: ["title", "subtitle", "verse", "reference"],
};
/** Ordem em que as linhas são cortadas quando o texto (acima do limite) não cabe na área segura. */
const SHRINK_ORDER: Role[] = ["verse", "subtitle", "title", "reference"];

const SAFE_TOP = SLIDE_SAFE_AREA.vertical;
const SAFE_BOTTOM = SLIDE_CANVAS.height - SLIDE_SAFE_AREA.vertical;
const SAFE_HEIGHT = SAFE_BOTTOM - SAFE_TOP;
const BOX_X = SLIDE_SAFE_AREA.side;
const BOX_WIDTH = SLIDE_CANVAS.width - 2 * SLIDE_SAFE_AREA.side;

const chars = (s: string) => Array.from(s).length;

function textOf(face: SlideFace, role: Role): string {
  const value = role === "title" ? face.title : face[role];
  return (value ?? "").trim();
}

function rangeOf(layout: SlideLayout, role: Role): FontRange {
  return (SLIDE_FONT_SIZES[layout] as Record<string, FontRange>)[role];
}

function limitOf(layout: SlideLayout, role: Role): number {
  return (SLIDE_MODEL_LIMITS[layout] as Record<string, number>)[role] ?? 0;
}

/** Três degraus pelo comprimento: até 1/3 do limite, o maior da faixa; até 2/3, o do meio; acima, o menor. */
function stepOf(length: number, limit: number): 0 | 1 | 2 {
  if (length <= Math.ceil(limit / 3)) return 0;
  if (length <= Math.ceil((2 * limit) / 3)) return 1;
  return 2;
}

function sizeAt(range: FontRange, step: 0 | 1 | 2): number {
  if (step === 0) return range.max;
  if (step === 1) return Math.round((range.min + range.max) / 2);
  return range.min;
}

function gapBetween(previous: Role, role: Role): number {
  if (role === "subtitle") return SLIDE_SPACING.titleSubtitle;
  if (role === "verse") return previous === "subtitle" ? SLIDE_SPACING.subtitleVerse : SLIDE_SPACING.titleVerse;
  return SLIDE_SPACING.verseReference;
}

const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();

/**
 * Linhas estimadas: quebra por palavra somando a largura de cada caractere (maiúscula mais larga); palavra maior
 * que a linha ocupa várias.
 */
function countLines(text: string, fontSize: number, glyphEm: number, tracking: number): number {
  const widthOf = (c: string) => fontSize * ((isUpper(c) ? SLIDE_GLYPH_WIDTH.upper : glyphEm) + tracking / 1000);
  const space = widthOf(" ");
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const glyphs = Array.from(word).map(widthOf);
    const width = glyphs.reduce((a, b) => a + b, 0);
    if (used > 0 && used + space + width <= BOX_WIDTH) {
      used += space + width;
      continue;
    }
    if (used > 0) {
      lines += 1;
      used = 0;
    }
    for (const g of glyphs) {
      if (used > 0 && used + g > BOX_WIDTH) {
        lines += 1;
        used = 0;
      }
      used += g;
    }
  }
  return lines;
}

type Draft = Omit<SlideBlock, "x" | "y" | "width" | "height" | "gapBefore"> & { reserve: number };
/** Altura da caixa: as linhas estimadas e, no título com bloco abaixo, uma linha de reserva (a estimativa pode errar). */
const heightOf = (b: Draft) => (b.maxLines + b.reserve) * b.fontSize * b.lineHeight;

/** Desenho do slide no modelo do manual: cores do visual, fontes, tamanhos dentro da faixa e posições na área segura. */
export function drawSlide(face: SlideFace, style: SlideStyle): SlideDrawing {
  const layout = face.layout;
  const theme = SLIDE_THEMES[style];
  const { background, color } = layout === "M01" ? theme.impact : theme;
  const align: SlideDrawing["align"] =
    chars(face.verse ?? "") > SLIDE_LEFT_ALIGN_OVER.verse || chars(face.title) > SLIDE_LEFT_ALIGN_OVER.title ? "left" : "center";
  const verseStep = stepOf(chars(textOf(face, "verse")), limitOf(layout, "verse"));

  const drafts: Draft[] = ROLES[layout]
    .map((role) => ({ role, text: textOf(face, role) }))
    .filter((p) => p.text)
    .map(({ role, text }) => {
      const fontFamily = role === "title" ? "title" : "body";
      const fontSize = sizeAt(rangeOf(layout, role), role === "reference" ? verseStep : stepOf(chars(text), limitOf(layout, role)));
      const tracking = role === "title" ? (layout === "M04" ? SLIDE_TRACKING.smallTitle : SLIDE_TRACKING.title) : SLIDE_TRACKING[role];
      return {
        role,
        text,
        fontFamily,
        fontSize,
        fontWeight: SLIDE_WEIGHTS[role],
        italic: role === "title",
        tracking,
        lineHeight: SLIDE_LINE_HEIGHT[role],
        align,
        maxLines: countLines(text, fontSize, SLIDE_GLYPH_WIDTH[fontFamily], tracking),
        clamped: role !== "reference" && chars(text) > limitOf(layout, role),
        reserve: 0,
      };
    });

  const gaps = drafts.map((b, i) => (i === 0 ? 0 : gapBetween(drafts[i - 1].role, b.role)));
  const total = () => drafts.reduce((sum, b, i) => sum + heightOf(b) + gaps[i], 0);
  // Só texto acima do limite do modelo passa da área segura: corta linhas, a fonte fica no mínimo da faixa.
  while (total() > SAFE_HEIGHT) {
    const next = SHRINK_ORDER.map((role) => drafts.find((b) => b.role === role && b.maxLines > 1)).find(Boolean);
    if (!next) break;
    next.maxLines -= 1;
    next.clamped = true;
  }
  // Reserva de uma linha no título que tem bloco abaixo, só quando ainda cabe na área segura.
  if (drafts.length > 1 && drafts[0].role === "title") {
    drafts[0].reserve = 1;
    if (total() > SAFE_HEIGHT) drafts[0].reserve = 0;
  }

  const tops: number[] = [];
  const before = [...gaps];
  if (layout === "M01" && drafts.length === 1) {
    const h = heightOf(drafts[0]);
    const center = SLIDE_CANVAS.height / 2 - SLIDE_OPTICAL_SHIFT * SLIDE_CANVAS.height;
    tops.push(Math.min(Math.max(center - h / 2, SAFE_TOP), SAFE_BOTTOM - h));
  } else if (layout === "M03" && drafts[0]?.role === "title" && drafts.length > 1) {
    // Título no topo da área segura; versículo e referência centralizados no espaço que sobra.
    const titleBottom = SAFE_TOP + heightOf(drafts[0]);
    const rest = drafts.slice(1).reduce((sum, b, i) => sum + heightOf(b) + (i === 0 ? 0 : gaps[i + 1]), 0);
    const start = titleBottom + gaps[1];
    // Centralizado no que sobra, mas o espaço até o título não passa de 90: o resto fica abaixo da referência.
    const extra = Math.min(Math.max(0, (SAFE_BOTTOM - start - rest) / 2), SLIDE_TITLE_VERSE_MAX_GAP - gaps[1]);
    let y = start + extra;
    before[1] = y - titleBottom;
    tops.push(SAFE_TOP);
    drafts.slice(1).forEach((b, i) => {
      if (i > 0) y += gaps[i + 1];
      tops.push(y);
      y += heightOf(b);
    });
  } else {
    let y = SAFE_TOP + Math.max(0, (SAFE_HEIGHT - total()) / 2);
    drafts.forEach((b, i) => {
      y += gaps[i];
      tops.push(y);
      y += heightOf(b);
    });
  }

  const blocks: SlideBlock[] = drafts.map(({ reserve: _reserve, ...b }, i) => ({
    ...b,
    x: BOX_X,
    y: tops[i],
    width: BOX_WIDTH,
    height: heightOf(drafts[i]),
    gapBefore: before[i],
  }));
  return { width: SLIDE_CANVAS.width, height: SLIDE_CANVAS.height, background, color, layout, align, blocks };
}
