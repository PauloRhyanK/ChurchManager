import type PptxGenJS from "pptxgenjs";
import { SLIDE_CANVAS, SLIDE_FONTS } from "../lib/slide-identity";
import type { SlideBlock } from "../lib/slide-layout";
import type { DeckSlide } from "./slides-deck";

const hex = (color: string) => color.replace("#", "");
/** 96 px por polegada: a tela de 1920×1080 vira 20 × 11,25 polegadas. */
const PX_PER_INCH = 96;
/** Fonte em pontos = px × 0,75. */
const PT_PER_PX = 0.75;
const LAYOUT_NAME = "IDENTIDADE_1920x1080";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Caixa de texto de um bloco do desenho: posição, fonte, tracking e entrelinha; nunca encolhe o texto (sem `fit`). */
export function blockTextOptions(b: SlideBlock, color: string): PptxGenJS.TextPropsOptions {
  const fontSize = round2(b.fontSize * PT_PER_PX);
  return {
    x: b.x / PX_PER_INCH,
    y: b.y / PX_PER_INCH,
    w: b.width / PX_PER_INCH,
    h: b.height / PX_PER_INCH,
    margin: 0,
    align: b.align,
    valign: "top",
    fontFace: SLIDE_FONTS[b.fontFamily],
    fontSize,
    bold: b.fontWeight >= 700,
    italic: b.italic,
    charSpacing: round2((b.tracking / 1000) * fontSize),
    lineSpacing: round2(fontSize * b.lineHeight),
    color: hex(color),
  };
}

/** Gera o arquivo .pptx (1920×1080, um slide por item, na identidade). pptxgenjs só é carregado aqui, na hora de exportar. */
export async function buildPptx(title: string, deck: DeckSlide[]): Promise<ArrayBuffer> {
  const { default: PptxGen } = await import("pptxgenjs");
  const pptx = new PptxGen();
  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_CANVAS.width / PX_PER_INCH, height: SLIDE_CANVAS.height / PX_PER_INCH });
  pptx.layout = LAYOUT_NAME;
  pptx.title = title;
  pptx.subject = title;
  pptx.author = "ChurchManager";
  pptx.company = "ChurchManager";
  for (const d of deck) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(d.background) };
    for (const b of d.blocks) slide.addText(b.text, blockTextOptions(b, d.color));
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
