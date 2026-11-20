import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { drawSlide } from "../lib/slide-layout";
import type { SlideFace } from "../lib/slides";
import { buildPptx, shapeOptions, textOptions, textRuns } from "./slides-pptx";

const face = (over: Partial<SlideFace> & Pick<SlideFace, "layout">): SlideFace => ({ title: "A luz chama", verse: null, reference: null, items: null, start: null, ...over });
const VERSE = drawSlide(face({ layout: "VERSE", verse: "Eu sou a luz do mundo.", reference: "João 8:12" }), "MINIMAL");
const BULLETS = drawSlide(face({ layout: "BULLETS", items: ["Pede-me (1 Reis 3:5)"] }), "MINIMAL");
const TITLE = (title: string) => drawSlide(face({ layout: "TITLE", title }), "MINIMAL");

describe("opções do pptxgenjs", () => {
  it("caixa de texto na posição do desenho (144 px por polegada), fonte em pt = px × 0,5, Montserrat, sem quebra nem fit", () => {
    const title = VERSE.texts.find((t) => t.role === "title")!;
    const o = textOptions(title, VERSE.theme);
    expect(o).toMatchObject({
      x: 128 / 144,
      y: title.y / 144,
      w: 1664 / 144,
      h: title.height / 144,
      margin: 0,
      align: "center",
      fontFace: "Montserrat",
      fontSize: 52,
      bold: true,
      color: "F6F2EA",
      wrap: false,
    });
    expect("fit" in o).toBe(false);
    const ref = VERSE.texts.find((t) => t.role === "reference")!;
    expect(textOptions(ref, VERSE.theme)).toMatchObject({ fontSize: 19, bold: true, color: "E3B862", charSpacing: 1 });
    const verse = VERSE.texts.find((t) => t.role === "verse")!;
    expect(textOptions(verse, VERSE.theme)).toMatchObject({ fontSize: 27, bold: false });
  });

  it("painel e traço em roundRect com o raio em polegadas; borda de 2 px vira 1 pt", () => {
    const panel = VERSE.shapes.find((s) => s.role === "panel")!;
    expect(shapeOptions(panel, VERSE.theme)).toMatchObject({
      x: 210 / 144,
      w: 1500 / 144,
      rectRadius: 28 / 144,
      fill: { color: "2C3F38" },
      line: { color: "42584F", width: 1 },
    });
    const rule = VERSE.shapes.find((s) => s.role === "rule")!;
    expect(shapeOptions(rule, VERSE.theme)).toMatchObject({ rectRadius: 3 / 144, fill: { color: "E3B862" }, line: { type: "none" } });
  });

  it("trechos: a referência final do item em dourado negrito", () => {
    const item = BULLETS.texts.find((t) => t.role === "item")!;
    expect(textRuns(item, BULLETS.theme)).toEqual([
      { text: "Pede-me ", options: { color: "F6F2EA", bold: false } },
      { text: "(1 Reis 3:5)", options: { color: "E3B862", bold: true } },
    ]);
    const title = drawSlide(face({ layout: "TITLE", title: "A agenda Profética está em Curso" }), "MINIMAL").texts[0];
    expect(textRuns(title, VERSE.theme).map((r) => [r.text, r.options?.breakLine ?? false])).toEqual([
      ["A agenda Profética está em", true],
      ["Curso", false],
    ]);
  });
});

describe("buildPptx (pptxgenjs de verdade)", () => {
  it("gera um zip (PK) com 3 slides", async () => {
    const bytes = new Uint8Array(await buildPptx("Luz", [TITLE("Um"), VERSE, TITLE("Três")]));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("ppt/slides/slide3.xml")).not.toBeNull();
    expect(zip.file("ppt/slides/slide4.xml")).toBeNull();
  }, 20000);

  it("16:9 em 13,333 × 7,5 pol, Montserrat, fundo e painel arredondado, sem encolher texto", async () => {
    const zip = await JSZip.loadAsync(await buildPptx("Luz", [VERSE]));
    const presentation = await zip.file("ppt/presentation.xml")!.async("string");
    expect(presentation).toContain('<p:sldSz cx="12192000" cy="6858000"');
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain('typeface="Montserrat"');
    expect(xml).toContain("João 8:12");
    expect(xml).toContain('srgbClr val="24352F"');
    expect(xml).toContain('prst="roundRect"');
    expect(xml).not.toContain("normAutofit");
  }, 20000);

  it("propriedades do arquivo: autor e empresa ChurchManager, assunto = título", async () => {
    const zip = await JSZip.loadAsync(await buildPptx("Luz do mundo", [TITLE("Um")]));
    const core = await zip.file("docProps/core.xml")!.async("string");
    const app = await zip.file("docProps/app.xml")!.async("string");
    expect(core).toContain("ChurchManager");
    expect(core).toContain("Luz do mundo");
    expect(app).toContain("<Company>ChurchManager</Company>");
  }, 20000);
});
