import type { DeckSlide } from "./slides-deck";

const hex = (color: string) => color.replace("#", "");

/** Gera o arquivo .pptx (16:9, um slide por item). pptxgenjs só é carregado aqui, na hora de exportar. */
export async function buildPptx(
  title: string,
  deck: DeckSlide[],
): Promise<ArrayBuffer> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = title;
  const width = 10;
  const height = 5.625;
  const boxWidth = width * 0.8;
  const x = (width - boxWidth) / 2;
  const refHeight = 0.5;
  for (const s of deck) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(s.background) };
    const textHeight = height - 0.5 - (s.reference ? refHeight + 0.2 : 0) - 0.3;
    slide.addText(s.text, {
      x,
      y: 0.3,
      w: boxWidth,
      h: textHeight,
      align: "center",
      valign: "middle",
      fit: "shrink",
      bold: s.bold,
      fontSize: s.fontSize,
      color: hex(s.textColor),
    });
    if (s.reference) {
      slide.addText(s.reference, {
        x,
        y: height - refHeight - 0.3,
        w: boxWidth,
        h: refHeight,
        align: "center",
        valign: "middle",
        fontSize: 16,
        color: hex(s.referenceColor),
      });
    }
  }
  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}

export async function downloadPptx(
  fileName: string,
  title: string,
  deck: DeckSlide[],
): Promise<void> {
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
