import { describe, expect, it } from "vitest";
import { AGENDA_DOC, AGENDA_TITLE } from "./sermon-example";
import { bulletRuns, drawSlide } from "./slide-layout";
import { buildSlides, PANEL, slideFace, type SlideFace } from "./slides";

const face = (over: Partial<SlideFace> & Pick<SlideFace, "layout">): SlideFace => ({
  title: "A luz chama",
  verse: null,
  reference: null,
  items: null,
  start: null,
  ...over,
});
const text = (d: ReturnType<typeof drawSlide>, role: string) => d.texts.filter((t) => t.role === role);
const lineText = (line: { text: string }[]) => line.map((r) => r.text).join("");

describe("drawSlide", () => {
  it("bloco (título, traço e painel) centralizado na vertical; título, traço e painel centralizados na horizontal", () => {
    const d = drawSlide(face({ layout: "VERSE", verse: "Eu sou a luz do mundo.", reference: "João 8:12" }), "MINIMAL");
    expect(d.block.y).toBeCloseTo((1080 - d.block.height) / 2, 6);
    const [title] = text(d, "title");
    expect(title).toMatchObject({ x: 128, width: 1664, align: "center", fontSize: 104, weight: 800, y: d.block.y });
    const rule = d.shapes.find((s) => s.role === "rule")!;
    expect(rule).toMatchObject({ x: 900, width: 120, height: 6, radius: 3, fill: "accent", y: title.y + title.height + 36 });
    const panel = d.shapes.find((s) => s.role === "panel")!;
    expect(panel).toMatchObject({ x: 210, width: 1500, radius: 28, fill: "panel", border: { width: 2, color: "border" }, y: rule.y + 6 + 36 });
    expect(panel.y + panel.height).toBeCloseTo(d.block.y + d.block.height, 6);
  });

  it("VERSE: aspa dourada, versículo centralizado e referência dourada em negrito com 2 px entre letras", () => {
    const d = drawSlide(face({ layout: "VERSE", verse: "Eu sou a luz do mundo.", reference: "João 8:12" }), "MINIMAL");
    const panel = d.shapes.find((s) => s.role === "panel")!;
    const [quote] = text(d, "quote");
    expect(quote).toMatchObject({ color: "accent", fontSize: 120, y: panel.y + 56 });
    expect(lineText(quote.lines[0])).toBe("“");
    const [verse] = text(d, "verse");
    expect(verse).toMatchObject({ align: "center", fontSize: 54, weight: 500, y: quote.y + 60 + 24, x: 306, width: 1308 });
    const [ref] = text(d, "reference");
    expect(ref).toMatchObject({ color: "accent", weight: 700, letterSpacing: 2, fontSize: 38, y: verse.y + verse.height + 24 });
    expect(ref.y + ref.height + 56).toBeCloseTo(panel.y + panel.height, 6);
  });

  it("capa do exemplo (título de 2 linhas e versículo de 4) cabe entre 96 e 984, como no slide aprovado", () => {
    const [cover] = buildSlides(AGENDA_TITLE, AGENDA_DOC, "VERSES_AND_POINTS");
    const d = drawSlide(slideFace(cover), "MINIMAL");
    expect(text(d, "title")[0].lines).toHaveLength(2);
    expect(text(d, "verse")[0].lines).toHaveLength(4);
    expect(d.block.y).toBeGreaterThanOrEqual(PANEL.margin.y);
    expect(d.block.y + d.block.height).toBeLessThanOrEqual(1080 - PANEL.margin.y);
    // No PNG aprovado o traço fica em ~363 e o painel vai de ~405 a ~982.
    expect(d.shapes.find((s) => s.role === "rule")!.y).toBeCloseTo(362, 0);
  });

  it("todos os slides do exemplo cabem na área útil (96..984)", () => {
    for (const mode of ["VERSES_AND_POINTS", "TITLES"] as const) {
      for (const s of buildSlides(AGENDA_TITLE, AGENDA_DOC, mode)) {
        const d = drawSlide(slideFace(s), "BACKGROUND");
        expect(d.block.y).toBeGreaterThanOrEqual(96 - 1e-6);
        expect(d.block.y + d.block.height).toBeLessThanOrEqual(984 + 1e-6);
      }
    }
  });

  it("NUMBERED: número dourado em 800 a partir de `start`, item em 600 alinhado à esquerda, lista centralizada no painel", () => {
    const d = drawSlide(face({ layout: "NUMBERED", items: ["Uma Agenda de Poder", "Uma Agenda de Fé"], start: 3 }), "MINIMAL");
    const markers = text(d, "marker");
    expect(markers.map((m) => lineText(m.lines[0]))).toEqual(["3", "4"]);
    expect(markers[0]).toMatchObject({ color: "accent", weight: 800, fontSize: 44 });
    const items = text(d, "item");
    expect(items[0]).toMatchObject({ align: "left", weight: 600, color: "text", fontSize: 44 });
    expect(items[1].y).toBeCloseTo(items[0].y + 55 + 12, 6);
    const left = markers[0].x;
    const right = items[0].x + items[0].width;
    expect((left + right) / 2).toBeCloseTo(960, 6);
    const panel = d.shapes.find((s) => s.role === "panel")!;
    expect(left).toBeGreaterThanOrEqual(panel.x + 96);
  });

  it("BULLETS: marcador dourado e a referência final entre parênteses em dourado negrito", () => {
    const item = "Deus visitou José em sonhos: ele sustentaria Israel no Egito (Gênesis 37:5)";
    const d = drawSlide(face({ layout: "BULLETS", items: [item, "Sem referência"] }), "MINIMAL");
    expect(text(d, "marker").map((m) => lineText(m.lines[0]))).toEqual(["•", "•"]);
    const [first, second] = text(d, "item");
    expect(first.weight).toBe(500);
    expect(first.lines.map(lineText).join(" ")).toBe(item);
    const accent = first.lines.flat().filter((r) => r.color === "accent");
    expect(accent.map((r) => r.text).join("")).toBe("(Gênesis 37:5)");
    expect(accent.every((r) => r.weight === 700)).toBe(true);
    expect(second.lines.flat().every((r) => r.color === "text")).toBe(true);
  });

  it("bulletRuns divide a referência que começa no meio da linha", () => {
    expect(bulletRuns("Pede-me (1 Reis 3:5)", ["Pede-me (1 Reis 3:5)"], 500)).toEqual([
      [
        { text: "Pede-me ", color: "text", weight: 500 },
        { text: "(1 Reis 3:5)", color: "accent", weight: 700 },
      ],
    ]);
  });

  it("TITLE: só título e traço, sem painel, centralizados como um bloco", () => {
    const d = drawSlide(face({ layout: "TITLE", title: "1. Uma Agenda de Poder" }), "MINIMAL");
    expect(d.shapes.map((s) => s.role)).toEqual(["rule"]);
    expect(d.texts.map((t) => t.role)).toEqual(["title"]);
    expect(d.block.height).toBeCloseTo(114.4 + 36 + 6, 6);
    expect(d.block.y).toBeCloseTo((1080 - d.block.height) / 2, 6);
  });

  it("cores da variação escolhida", () => {
    expect(drawSlide(face({ layout: "TITLE" }), "MINIMAL").theme).toMatchObject({ background: "#24352F", panel: "#2C3F38", border: "#42584F", text: "#F6F2EA", accent: "#E3B862" });
    expect(drawSlide(face({ layout: "TITLE" }), "BACKGROUND").theme).toMatchObject({ background: "#11223B", panel: "#182D4B", border: "#2B4468" });
  });
});
