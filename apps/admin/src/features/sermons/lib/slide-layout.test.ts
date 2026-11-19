import { describe, expect, it } from "vitest";
import { drawSlide, type SlideBlock } from "./slide-layout";
import { SLIDE_FONT_SIZES, SLIDE_THEMES } from "./slide-identity";
import type { SlideFace, SlideLayout, SlideStyle } from "./slides";

const face = (over: Partial<SlideFace> & { layout: SlideLayout }): SlideFace => ({ title: "A luz chama", subtitle: null, verse: null, reference: null, ...over });

const SHORT: Record<SlideLayout, SlideFace> = {
  M01: face({ layout: "M01", title: "A luz chama" }),
  M02: face({ layout: "M02", title: "A luz chama", subtitle: "Antes de procurar, a luz já estava acesa" }),
  M03: face({ layout: "M03", title: "A luz chama", verse: "Eu sou a luz do mundo.", reference: "João 8:12 · BLIVRE" }),
  M04: face({ layout: "M04", title: "A luz", subtitle: "Ninguém acha o caminho sozinho", verse: "Eu sou a luz do mundo.", reference: "João 8:12 · BLIVRE" }),
};
// No limite de cada modelo (o maior texto que a API deixa num slide).
const FULL: Record<SlideLayout, SlideFace> = {
  M01: face({ layout: "M01", title: "palavra ".repeat(10).trim().slice(0, 75) }),
  M02: face({ layout: "M02", title: "p".repeat(4) + " palavra".repeat(7), subtitle: "frase ".repeat(25).trim() }),
  M03: face({ layout: "M03", title: "palavra ".repeat(7).trim().slice(0, 50), verse: "texto bíblico ".repeat(16).trim().slice(0, 220), reference: "1 Coríntios 13:4 · BLIVRE" }),
  M04: face({ layout: "M04", title: "palavra ".repeat(6).trim().slice(0, 45), subtitle: "frase ".repeat(15).trim(), verse: "texto bíblico ".repeat(12).trim().slice(0, 160), reference: "João 8:12 · BLIVRE" }),
};
const LAYOUTS: SlideLayout[] = ["M01", "M02", "M03", "M04"];
const STYLES: SlideStyle[] = ["MINIMAL", "BACKGROUND"];
const roles = (blocks: SlideBlock[]) => blocks.map((b) => b.role);
const byRole = (blocks: SlideBlock[], role: SlideBlock["role"]) => blocks.find((b) => b.role === role)!;

describe("drawSlide", () => {
  it("tela de 1920×1080 e os blocos de cada modelo, na ordem", () => {
    const blocks = LAYOUTS.map((l) => drawSlide(SHORT[l], "MINIMAL"));
    expect(blocks.every((d) => d.width === 1920 && d.height === 1080)).toBe(true);
    expect(blocks.map((d) => [d.layout, roles(d.blocks)])).toEqual([
      ["M01", ["title"]],
      ["M02", ["title", "subtitle"]],
      ["M03", ["title", "verse", "reference"]],
      ["M04", ["title", "subtitle", "verse", "reference"]],
    ]);
  });

  it("cores dos dois visuais: azul institucional (M01 em azul profundo) e verde profundo", () => {
    expect(SLIDE_THEMES.MINIMAL.name).toBe("Azul institucional");
    expect(SLIDE_THEMES.BACKGROUND.name).toBe("Verde profundo");
    const colors = (style: SlideStyle) => LAYOUTS.map((l) => [drawSlide(SHORT[l], style).background, drawSlide(SHORT[l], style).color]);
    expect(colors("MINIMAL")).toEqual([
      ["#182F5D", "#F1EBE2"],
      ["#334C71", "#F1EBE2"],
      ["#334C71", "#F1EBE2"],
      ["#334C71", "#F1EBE2"],
    ]);
    expect(colors("BACKGROUND")).toEqual(Array(4).fill(["#092A1E", "#FFFFFF"]));
  });

  it("fontes e pesos: título na fonte de título em itálico médio; subtítulo e versículo Poppins médio; referência negrito", () => {
    const d = drawSlide(SHORT.M04, "MINIMAL");
    expect(d.blocks.map((b) => [b.role, b.fontFamily, b.fontWeight, b.italic])).toEqual([
      ["title", "title", 500, true],
      ["subtitle", "body", 500, false],
      ["verse", "body", 500, false],
      ["reference", "body", 700, false],
    ]);
  });

  it("tracking: títulos -70; título do 04 e subtítulos -50; versículo -30", () => {
    expect(byRole(drawSlide(SHORT.M01, "MINIMAL").blocks, "title").tracking).toBe(-70);
    expect(byRole(drawSlide(SHORT.M03, "MINIMAL").blocks, "title").tracking).toBe(-70);
    const m04 = drawSlide(SHORT.M04, "MINIMAL").blocks;
    expect([byRole(m04, "title").tracking, byRole(m04, "subtitle").tracking, byRole(m04, "verse").tracking]).toEqual([-50, -50, -30]);
    expect(byRole(drawSlide(SHORT.M02, "MINIMAL").blocks, "subtitle").tracking).toBe(-50);
  });

  it("tamanhos sempre dentro da faixa do modelo, nos dois visuais, do texto curto ao do limite", () => {
    for (const style of STYLES) {
      for (const l of LAYOUTS) {
        for (const f of [SHORT[l], FULL[l]]) {
          for (const b of drawSlide(f, style).blocks) {
            const range = (SLIDE_FONT_SIZES[l] as Record<string, { min: number; max: number }>)[b.role];
            expect(b.fontSize).toBeGreaterThanOrEqual(range.min);
            expect(b.fontSize).toBeLessThanOrEqual(range.max);
          }
        }
      }
    }
  });

  it("três degraus do maior para o menor da faixa pelo comprimento do texto", () => {
    const size = (n: number) => drawSlide(face({ layout: "M01", title: "a".repeat(n) }), "MINIMAL").blocks[0].fontSize;
    expect([size(10), size(25), size(26), size(50), size(51), size(75)]).toEqual([150, 150, 125, 125, 100, 100]);
  });

  it("texto acima do limite usa o mínimo da faixa, nunca menos, e as linhas são cortadas para caber na área segura", () => {
    const d = drawSlide(face({ layout: "M01", title: "palavra ".repeat(37).trim() }), "MINIMAL");
    expect(d.blocks[0].fontSize).toBe(100);
    expect(d.blocks[0].y).toBeGreaterThanOrEqual(190);
    expect(d.blocks[0].y + d.blocks[0].height).toBeLessThanOrEqual(890);
    const verse = drawSlide(face({ layout: "M03", verse: "texto ".repeat(150), reference: "João 1:1" }), "MINIMAL");
    expect(byRole(verse.blocks, "verse").fontSize).toBe(36);
    const last = verse.blocks[verse.blocks.length - 1];
    expect(last.y + last.height).toBeLessThanOrEqual(890);
  });

  it("caixas dentro da área segura (240/190) e sem sobreposição, nos quatro modelos", () => {
    for (const l of LAYOUTS) {
      for (const f of [SHORT[l], FULL[l]]) {
        const { blocks } = drawSlide(f, "BACKGROUND");
        let bottom = 190;
        for (const b of blocks) {
          expect(b.x).toBeGreaterThanOrEqual(240);
          expect(b.x + b.width).toBeLessThanOrEqual(1680);
          expect(b.y).toBeGreaterThanOrEqual(bottom);
          expect(b.y + b.height).toBeLessThanOrEqual(890);
          expect(b.y - bottom).toBeCloseTo(b === blocks[0] ? b.y - 190 : b.gapBefore, 5);
          bottom = b.y + b.height;
        }
      }
    }
  });

  it("espaços entre blocos: título-subtítulo 55, título-versículo 70 (ou mais), subtítulo-versículo 40, versículo-referência 12", () => {
    expect(roles(drawSlide(SHORT.M02, "MINIMAL").blocks).length).toBe(2);
    expect(byRole(drawSlide(SHORT.M02, "MINIMAL").blocks, "subtitle").gapBefore).toBe(55);
    const m04 = drawSlide(SHORT.M04, "MINIMAL").blocks;
    expect(m04.map((b) => b.gapBefore)).toEqual([0, 55, 40, 12]);
    const m03 = drawSlide(SHORT.M03, "MINIMAL").blocks;
    expect(byRole(m03, "verse").gapBefore).toBeGreaterThanOrEqual(70);
    expect(byRole(m03, "reference").gapBefore).toBe(12);
  });

  it("M01 no centro óptico (3% acima do centro); M03 com o título no topo da área segura", () => {
    const [t] = drawSlide(SHORT.M01, "MINIMAL").blocks;
    expect(t.y + t.height / 2).toBeCloseTo(540 - 0.03 * 1080, 0);
    expect(drawSlide(SHORT.M03, "MINIMAL").blocks[0].y).toBe(190);
    const m02 = drawSlide(SHORT.M02, "MINIMAL").blocks;
    const top = m02[0].y;
    const bottom = m02[1].y + m02[1].height;
    expect(top - 190).toBeCloseTo(890 - bottom, 0);
  });

  it("alinhamento: centralizado; à esquerda quando o versículo passa de 110 ou o título de 35", () => {
    expect(drawSlide(SHORT.M03, "MINIMAL").align).toBe("center");
    const longVerse = drawSlide(face({ layout: "M03", verse: "a".repeat(111), reference: "João 1:1" }), "MINIMAL");
    expect(longVerse.align).toBe("left");
    expect(longVerse.blocks.every((b) => b.align === "left")).toBe(true);
    expect(drawSlide(face({ layout: "M03", verse: "a".repeat(110), reference: "João 1:1" }), "MINIMAL").align).toBe("center");
    expect(drawSlide(face({ layout: "M01", title: "a".repeat(36) }), "MINIMAL").align).toBe("left");
    expect(drawSlide(face({ layout: "M01", title: "a".repeat(35) }), "MINIMAL").align).toBe("center");
  });

  it("bloco sem texto não é desenhado (resumo antigo sem título)", () => {
    const d = drawSlide(face({ layout: "M02", title: "", subtitle: "Frase" }), "MINIMAL");
    expect(roles(d.blocks)).toEqual(["subtitle"]);
    expect(d.blocks[0].gapBefore).toBe(0);
  });

  it("bloco dentro do limite não é cortado (clamped false); só o texto acima do limite é", () => {
    for (const l of LAYOUTS) for (const f of [SHORT[l], FULL[l]]) expect(drawSlide(f, "MINIMAL").blocks.every((b) => !b.clamped)).toBe(true);
    const long = drawSlide(face({ layout: "M01", title: "palavra ".repeat(37).trim() }), "MINIMAL");
    expect(long.blocks[0].clamped).toBe(true);
  });

  it("título em maiúsculas: as letras maiúsculas contam mais largura", () => {
    const [caps] = drawSlide(face({ layout: "M01", title: "QUANDO O MUNDO INTEIRO" }), "MINIMAL").blocks;
    expect(caps.fontSize).toBe(150);
    expect(caps.maxLines).toBeGreaterThanOrEqual(2);
    const [mixed] = drawSlide(face({ layout: "M01", title: "Quando o mundo inteiro" }), "MINIMAL").blocks;
    expect(mixed.maxLines).toBeLessThanOrEqual(caps.maxLines);
  });

  it("nos quatro modelos no limite, com título misto e em maiúsculas: caixas na área segura e sem sobreposição; o título reserva uma linha a mais quando cabe", () => {
    const caps = (f: SlideFace): SlideFace => ({ ...f, title: f.title.toUpperCase() });
    const reserved: string[] = [];
    for (const l of LAYOUTS) {
      for (const [name, f] of [["misto", FULL[l]], ["maiúsculas", caps(FULL[l])]] as const) {
        const { blocks } = drawSlide(f, "MINIMAL");
        let bottom = 190;
        for (const b of blocks) {
          expect(b.y).toBeGreaterThanOrEqual(bottom);
          expect(b.y + b.height).toBeLessThanOrEqual(890);
          bottom = b.y + b.height;
        }
        const t = blocks[0];
        if (t.height > t.maxLines * t.fontSize * t.lineHeight + 0.001) reserved.push(`${l} ${name}`);
      }
    }
    // M01 não tem bloco abaixo do título: nunca reserva. M03 no limite com título em maiúsculas não cabe com a reserva.
    expect(reserved).toEqual(["M02 misto", "M02 maiúsculas", "M03 misto", "M04 misto", "M04 maiúsculas"]);
  });

  it("títulos em maiúsculas no limite de M02 e M04 empurram o bloco seguinte para baixo da linha extra", () => {
    for (const f of [FULL.M02, FULL.M04]) {
      const { blocks } = drawSlide({ ...f, title: f.title.toUpperCase() }, "BACKGROUND");
      const [t, next] = blocks;
      expect(next.y - (t.y + (t.maxLines + 1) * t.fontSize * t.lineHeight)).toBeGreaterThanOrEqual(0);
      expect(next.y + next.height).toBeLessThanOrEqual(890);
    }
  });

  it("M03: o espaço entre título e versículo fica entre 70 e 90; o que sobra vai para baixo da referência", () => {
    const m03 = drawSlide(SHORT.M03, "MINIMAL").blocks;
    const gap = byRole(m03, "verse").gapBefore;
    expect(gap).toBeGreaterThanOrEqual(70);
    expect(gap).toBeLessThanOrEqual(90);
  });
});
