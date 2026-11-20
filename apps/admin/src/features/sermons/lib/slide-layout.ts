// Desenho de um slide na identidade "painel" (docs/identidade-slides.md), numa tela de 1920×1080.
// Função pura: a prévia (SlidePreview) e a apresentação (.pptx) desenham a mesma geometria.
// As medidas e a estimativa de linhas são as do gerador (PANEL e wrapLines em slides.ts): o texto é quebrado aqui, em
// palavra inteira, e cada linha vai pronta; a fonte nunca encolhe (o gerador já divide o que não cabe).
import { SLIDE_THEMES, type SlideTheme } from "./slide-identity";
import { PANEL, SLIDE_LAYOUTS, slideFace, wrapLines, type SlideFace, type SlideFaceInput, type SlideLayout, type SlideStyle } from "./slides";

export type ColorRole = "text" | "accent";

/** Trecho de uma linha com cor e peso próprios (ex.: a referência entre parênteses em dourado negrito). */
export type TextRun = { text: string; color: ColorRole; weight: number };

export type TextRole = "title" | "quote" | "verse" | "reference" | "marker" | "item";

/** Caixa de texto em px da tela 1920×1080. `lines` já vem quebrado; cada linha tem `lineHeight` px de altura. */
export type TextBox = {
  role: TextRole;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  weight: number;
  color: ColorRole;
  /** Altura de cada linha, em px. */
  lineHeight: number;
  /** Espaço entre letras, em px. */
  letterSpacing: number;
  align: "left" | "center" | "right";
  lines: TextRun[][];
};

export type ShapeBox = {
  role: "rule" | "panel";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: "accent" | "panel";
  border: { width: number; color: "border" } | null;
};

export type SlideDrawing = {
  layout: SlideLayout;
  theme: SlideTheme;
  /** O bloco inteiro (título, traço e painel), centralizado na vertical. */
  block: { y: number; height: number };
  /** Desenhados antes dos textos, nesta ordem. */
  shapes: ShapeBox[];
  texts: TextBox[];
};

const CENTER_X = PANEL.canvas.width / 2;
/** Coluna do número ou do marcador nas listas e o espaço até o texto do item. */
const MARKER = { width: 44, gap: 18 } as const;
const MARKER_COLUMN = MARKER.width + MARKER.gap;
/** Largura média de um caractere (em) na Montserrat, medida nos slides aprovados, para centralizar a lista no painel. */
const LIST_CHAR_EM = { NUMBERED: 0.57, BULLETS: 0.53 } as const;

const plain = (lines: string[], color: ColorRole, weight: number): TextRun[][] => lines.map((text) => [{ text, color, weight }]);

/**
 * Linhas de um item de lista com marcador: o trecho final entre parênteses (a referência) vai em dourado negrito,
 * mesmo quando cai na linha seguinte.
 */
export function bulletRuns(item: string, lines: string[], weight: number): TextRun[][] {
  const text = item.replace(/\s+/g, " ").trim();
  const match = /\([^()]*\)$/.exec(text);
  if (!match) return plain(lines, "text", weight);
  const from = match.index;
  let cursor = 0;
  return lines.map((line): TextRun[] => {
    const start = Math.max(cursor, text.indexOf(line, cursor));
    const end = start + line.length;
    cursor = end;
    if (end <= from) return [{ text: line, color: "text", weight }];
    if (start >= from) return [{ text: line, color: "accent", weight: 700 }];
    const k = from - start;
    return [
      { text: line.slice(0, k), color: "text", weight },
      { text: line.slice(k), color: "accent", weight: 700 },
    ];
  });
}

type Content = { height: number; place(top: number): TextBox[] };

function verseContent(face: SlideFace): Content {
  const lines = wrapLines(face.verse ?? "", PANEL.verse.chars);
  const verseLines = Math.max(1, lines.length);
  const reference = face.reference?.trim() || null;
  const inner = PANEL.quote.height + PANEL.quote.gap + verseLines * PANEL.verse.line + (reference ? PANEL.reference.gap + PANEL.reference.height : 0);
  const x = PANEL.panel.x + PANEL.panel.padX;
  const width = PANEL.panel.innerWidth;
  return {
    height: inner + 2 * PANEL.panel.padY,
    place(top) {
      let y = top + PANEL.panel.padY;
      const out: TextBox[] = [
        {
          role: "quote",
          x,
          y,
          width,
          height: PANEL.quote.height,
          fontSize: PANEL.quote.size,
          weight: PANEL.quote.weight,
          color: "accent",
          lineHeight: PANEL.quote.height,
          letterSpacing: 0,
          align: "center",
          lines: plain(["“"], "accent", PANEL.quote.weight),
        },
      ];
      y += PANEL.quote.height + PANEL.quote.gap;
      out.push({
        role: "verse",
        x,
        y,
        width,
        height: verseLines * PANEL.verse.line,
        fontSize: PANEL.verse.size,
        weight: PANEL.verse.weight,
        color: "text",
        lineHeight: PANEL.verse.line,
        letterSpacing: 0,
        align: "center",
        lines: plain(lines, "text", PANEL.verse.weight),
      });
      y += verseLines * PANEL.verse.line;
      if (reference) {
        y += PANEL.reference.gap;
        out.push({
          role: "reference",
          x,
          y,
          width,
          height: PANEL.reference.height,
          fontSize: PANEL.reference.size,
          weight: PANEL.reference.weight,
          color: "accent",
          lineHeight: PANEL.reference.height,
          letterSpacing: PANEL.reference.letterSpacing,
          align: "center",
          lines: plain([reference], "accent", PANEL.reference.weight),
        });
      }
      return out;
    },
  };
}

function listContent(face: SlideFace, layout: "NUMBERED" | "BULLETS"): Content {
  const spec = layout === "NUMBERED" ? PANEL.numbered : PANEL.bullets;
  const items = face.items ?? [];
  const wrapped = items.map((item) => wrapLines(item, spec.chars));
  const rows = wrapped.map((lines) => Math.max(1, lines.length));
  const longest = Math.max(0, ...wrapped.flat().map((l) => Array.from(l).length));
  const textWidth = Math.min(PANEL.panel.innerWidth - MARKER_COLUMN, Math.ceil(longest * spec.size * LIST_CHAR_EM[layout]));
  const left = CENTER_X - (MARKER_COLUMN + textWidth) / 2;
  const height = rows.reduce((n, r) => n + r * spec.line, 0) + Math.max(0, items.length - 1) * spec.gap;
  const start = face.start ?? 1;
  return {
    height: height + 2 * PANEL.panel.padY,
    place(top) {
      const out: TextBox[] = [];
      let y = top + PANEL.panel.padY;
      items.forEach((item, i) => {
        const marker = layout === "NUMBERED" ? String(start + i) : "•";
        out.push({
          role: "marker",
          x: left,
          y,
          width: MARKER.width,
          height: spec.line,
          fontSize: spec.size,
          weight: 800,
          color: "accent",
          lineHeight: spec.line,
          letterSpacing: 0,
          align: "right",
          lines: plain([marker], "accent", 800),
        });
        out.push({
          role: "item",
          x: left + MARKER_COLUMN,
          y,
          width: textWidth,
          height: rows[i] * spec.line,
          fontSize: spec.size,
          weight: spec.weight,
          color: "text",
          lineHeight: spec.line,
          letterSpacing: 0,
          align: "left",
          lines: layout === "BULLETS" ? bulletRuns(item, wrapped[i], spec.weight) : plain(wrapped[i], "text", spec.weight),
        });
        y += rows[i] * spec.line + spec.gap;
      });
      return out;
    },
  };
}

/**
 * Geometria absoluta do slide em 1920×1080:
 * - título (centralizado, em até 1664 de largura), traço dourado e painel formam um bloco centralizado na vertical;
 * - painel em x = 210, 1500 de largura, raio 28 e borda de 2, com altura do conteúdo;
 * - VERSE: aspa, versículo centralizado e referência; NUMBERED/BULLETS: número ou marcador dourado e o item,
 *   alinhados à esquerda, com a lista centralizada no painel;
 * - TITLE: só título e traço, sem painel.
 */
export function drawSlide(face: SlideFace, style: SlideStyle): SlideDrawing {
  const theme = SLIDE_THEMES[style];
  const titleLines = wrapLines(face.title ?? "", PANEL.title.chars);
  const titleHeight = titleLines.length * PANEL.title.line;
  const content = face.layout === "VERSE" ? verseContent(face) : face.layout === "TITLE" ? null : listContent(face, face.layout);
  const hasTitle = titleLines.length > 0;
  const ruleHeight = hasTitle ? PANEL.rule.gap + PANEL.rule.height : 0;
  const panelHeight = content ? (hasTitle ? PANEL.rule.gap : 0) + content.height : 0;
  const total = titleHeight + ruleHeight + panelHeight;
  const top = (PANEL.canvas.height - total) / 2;

  const shapes: ShapeBox[] = [];
  const texts: TextBox[] = [];
  let y = top;
  if (hasTitle) {
    texts.push({
      role: "title",
      x: PANEL.margin.x,
      y,
      width: PANEL.area.width,
      height: titleHeight,
      fontSize: PANEL.title.size,
      weight: PANEL.title.weight,
      color: "text",
      lineHeight: PANEL.title.line,
      letterSpacing: 0,
      align: "center",
      lines: plain(titleLines, "text", PANEL.title.weight),
    });
    y += titleHeight + PANEL.rule.gap;
    shapes.push({
      role: "rule",
      x: CENTER_X - PANEL.rule.width / 2,
      y,
      width: PANEL.rule.width,
      height: PANEL.rule.height,
      radius: PANEL.rule.radius,
      fill: "accent",
      border: null,
    });
    y += PANEL.rule.height + (content ? PANEL.rule.gap : 0);
  }
  if (content) {
    shapes.push({
      role: "panel",
      x: PANEL.panel.x,
      y,
      width: PANEL.panel.width,
      height: content.height,
      radius: PANEL.panel.radius,
      fill: "panel",
      border: { width: PANEL.panel.border, color: "border" },
    });
    texts.push(...content.place(y));
  }
  return { layout: face.layout, theme, block: { y: top, height: total }, shapes, texts };
}

/** Cor de um papel no tema. */
export function roleColor(theme: SlideTheme, role: ColorRole | ShapeBox["fill"] | "border"): string {
  return theme[role];
}

/** Slide já no formato da tela (PublicSlide) ou ainda por montar (item do editor, cópia antiga só com kind/text/reference). */
export type PreviewSlide = SlideFace | (SlideFaceInput & { title?: string });

/** O que a tela mostra de um slide, em qualquer dos formatos acima. */
export function toFace(slide: PreviewSlide): SlideFace {
  const s = slide as Partial<SlideFace> & Partial<SlideFaceInput>;
  if (typeof s.title === "string" && s.layout && SLIDE_LAYOUTS.includes(s.layout)) {
    return { layout: s.layout, title: s.title, verse: s.verse ?? null, reference: s.reference ?? null, items: s.items ?? null, start: s.start ?? null };
  }
  // Item do editor ou cópia antiga (modelos M01–M04): o padrão do tipo, com o título antigo como heading.
  const input = slide as SlideFaceInput & { title?: string };
  return slideFace({ ...input, heading: input.heading ?? input.title ?? null });
}
