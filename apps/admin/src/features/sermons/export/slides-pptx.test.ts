import JSZip from 'jszip';
import { describe, expect, it } from "vitest";
import { drawSlide } from "../lib/slide-layout";
import type { SlideFace } from "../lib/slides";
import { blockTextOptions, buildPptx } from "./slides-pptx";
import type { DeckSlide } from "./slides-deck";

const face = (over: Partial<SlideFace> & { layout: SlideFace["layout"] }): SlideFace => ({ title: "A luz chama", subtitle: null, verse: null, reference: null, ...over });
const M03 = drawSlide(face({ layout: "M03", verse: "Eu sou a luz do mundo.", reference: "João 8:12 · BLIVRE" }), "MINIMAL");
const slide = (text: string, reference: string | null): DeckSlide =>
  drawSlide(face(reference ? { layout: "M03", verse: text, reference } : { layout: "M01", title: text }), "MINIMAL");

describe("blockTextOptions", () => {
  it("uma caixa na posição do desenho (96 px por polegada), fonte em pontos e tracking em charSpacing, sem fit", () => {
    const [title, verse, reference] = M03.blocks;
    const o = blockTextOptions(title, M03.color);
    expect(o).toMatchObject({
      x: title.x / 96,
      y: title.y / 96,
      w: title.width / 96,
      h: title.height / 96,
      margin: 0,
      valign: "top",
      align: "center",
      fontFace: "Playfair Display",
      fontSize: title.fontSize * 0.75,
      italic: true,
      bold: false,
      color: "F1EBE2",
    });
    expect(o.charSpacing).toBeCloseTo((-70 / 1000) * title.fontSize * 0.75, 2);
    expect(o.lineSpacing).toBeCloseTo(title.fontSize * 0.75 * title.lineHeight, 2);
    expect("fit" in o).toBe(false);
    expect(blockTextOptions(verse, M03.color)).toMatchObject({ fontFace: "Poppins", italic: false, bold: false });
    expect(blockTextOptions(reference, M03.color)).toMatchObject({ fontFace: "Poppins", bold: true });
  });
});

describe("buildPptx (pptxgenjs de verdade)", () => {
  it("gera um zip não vazio (PK) com 3 slides", async () => {
    const data = await buildPptx("Luz", [
      slide("Um", "João 1:1"),
      slide("Dois", null),
      slide("Três", "João 1:3"),
    ]);
    const bytes = new Uint8Array(data);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("ppt/slides/slide3.xml");
    expect(text).not.toContain("ppt/slides/slide4.xml");
  }, 20000);

  it("tela de 1920×1080 (20 × 11,25 pol), fontes de título e Poppins, sem encolher texto", async () => {
    const zip = await JSZip.loadAsync(await buildPptx("Luz", [M03]));
    const presentation = await zip.file("ppt/presentation.xml")!.async("string");
    expect(presentation).toContain('<p:sldSz cx="18288000" cy="10287000"');
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain('typeface="Playfair Display"');
    expect(xml).toContain('typeface="Poppins"');
    expect(xml).toContain("João 8:12 · BLIVRE");
    expect(xml).toContain('srgbClr val="334C71"');
    expect(xml).not.toContain("normAutofit");
    expect((xml.match(/<p:sp>/g) ?? []).length).toBe(3);
  }, 20000);

  it('propriedades do arquivo: autor e empresa ChurchManager, assunto = título', async () => {
    const zip = await JSZip.loadAsync(await buildPptx('Luz do mundo', [slide('Um', null)]));
    const core = await zip.file('docProps/core.xml')!.async('string');
    const app = await zip.file('docProps/app.xml')!.async('string');
    expect(core).toContain('ChurchManager');
    expect(core).toContain('Luz do mundo');
    expect(core).not.toMatch(/<dc:creator>PptxGenJS/);
    expect(app).toContain('<Company>ChurchManager</Company>');
    expect(app).not.toMatch(/<Company>PptxGenJS/);
  }, 20000);
});
