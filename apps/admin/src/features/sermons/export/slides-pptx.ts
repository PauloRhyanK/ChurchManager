import type PptxGenJS from "pptxgenjs";
import { SLIDE_FONT } from "../lib/slide-identity";
import type { ShapeBox, TextBox } from "../lib/slide-layout";
import type { DeckSlide } from "./slides-deck";

const hex = (color: string) => color.replace("#", "");
/** 144 px por polegada: a tela de 1920×1080 vira 13,333 × 7,5 polegadas (LAYOUT_WIDE). */
const PX_PER_INCH = 144;
/** Fonte em pontos = px × 0,5. */
const PT_PER_PX = 0.5;
const inch = (px: number) => px / PX_PER_INCH;
const pt = (px: number) => Math.round(px * PT_PER_PX * 100) / 100;

/** Painel e traço: retângulo arredondado com o raio em polegadas; a borda de 2 px vira 1 pt. */
export function shapeOptions(s: ShapeBox, theme: DeckSlide["theme"]): PptxGenJS.ShapeProps {
  return {
    x: inch(s.x),
    y: inch(s.y),
    w: inch(s.width),
    h: inch(s.height),
    rectRadius: inch(s.radius),
    fill: { color: hex(theme[s.fill]) },
    line: s.border ? { color: hex(theme[s.border.color]), width: pt(s.border.width) } : { type: "none" },
  };
}

/** Linhas da caixa como trechos do pptxgenjs: cada linha termina em quebra; cor e negrito por trecho. */
export function textRuns(t: TextBox, theme: DeckSlide["theme"]): PptxGenJS.TextProps[] {
  const out: PptxGenJS.TextProps[] = [];
  t.lines.forEach((line, i) => {
    line.forEach((run, j) => {
      out.push({
        text: run.text,
        options: {
          color: hex(theme[run.color]),
          bold: run.weight >= 700,
          ...(i < t.lines.length - 1 && j === line.length - 1 ? { breakLine: true } : {}),
        },
      });
    });
  });
  return out;
}

/** Caixa de texto na posição do desenho, sem quebra automática (as linhas já vêm quebradas) e sem encolher. */
export function textOptions(t: TextBox, theme: DeckSlide["theme"]): PptxGenJS.TextPropsOptions {
  return {
    x: inch(t.x),
    y: inch(t.y),
    w: inch(t.width),
    h: inch(t.height),
    margin: 0,
    align: t.align,
    valign: "top",
    wrap: false,
    fontFace: SLIDE_FONT,
    fontSize: pt(t.fontSize),
    bold: t.weight >= 700,
    color: hex(theme[t.color]),
    lineSpacing: pt(t.lineHeight),
    ...(t.letterSpacing ? { charSpacing: pt(t.letterSpacing) } : {}),
  };
}

/** Gera o arquivo .pptx (16:9, um slide por item, na identidade). pptxgenjs só é carregado aqui, na hora de exportar. */
export async function buildPptx(title: string, deck: DeckSlide[]): Promise<ArrayBuffer> {
  const { default: PptxGen } = await import("pptxgenjs");
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  pptx.subject = title;
  pptx.author = "ChurchManager";
  pptx.company = "ChurchManager";
  // A transição fade do manual fica de fora: o pptxgenjs não tem transições.
  for (const d of deck) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(d.theme.background) };
    for (const s of d.shapes) slide.addShape(pptx.ShapeType.roundRect, shapeOptions(s, d.theme));
    for (const t of d.texts) slide.addText(textRuns(t, d.theme), textOptions(t, d.theme));
  }
  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}

export async function downloadPptx(fileName: string, title: string, deck: DeckSlide[]): Promise<void> {
  const data = await buildPptx(title, deck);
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
