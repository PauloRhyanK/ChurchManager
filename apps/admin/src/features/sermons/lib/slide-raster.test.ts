import { describe, expect, it } from "vitest";
import { SLIDE_THEMES } from "./slide-identity";
import { drawSlide } from "./slide-layout";
import { paintSlide, type Paint2D } from "./slide-raster";
import type { SlideFace } from "./slides";

type Call = { op: string; args: unknown[]; fillStyle: unknown; strokeStyle: unknown; lineWidth: number; font: string; letterSpacing?: string };

/** Contexto 2D falso: grava cada chamada com o estado do momento. Texto mede 10 px por caractere; fonte 0,968/0,251 em. */
function recorder(withLetterSpacing = true) {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: "" as Paint2D["fillStyle"],
    strokeStyle: "" as Paint2D["strokeStyle"],
    lineWidth: 1,
    font: "",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    ...(withLetterSpacing ? { letterSpacing: "0px" } : {}),
  } as Paint2D;
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth, font: ctx.font, letterSpacing: ctx.letterSpacing });
  };
  Object.assign(ctx, {
    fillRect: record("fillRect"),
    beginPath: record("beginPath"),
    roundRect: record("roundRect"),
    moveTo: record("moveTo"),
    arcTo: record("arcTo"),
    closePath: record("closePath"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillText: record("fillText"),
    measureText: (text: string) => {
      const size = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 0);
      return { width: Array.from(text).length * 10, fontBoundingBoxAscent: 0.968 * size, fontBoundingBoxDescent: 0.251 * size };
    },
  });
  return { ctx, calls };
}

const VERSE: SlideFace = {
  layout: "VERSE",
  title: "1. A luz chama",
  verse: "Eu sou a luz do mundo; quem me segue não andará em trevas.",
  reference: "João 8:12",
  items: null,
  start: null,
};

describe("paintSlide", () => {
  it("desenha um slide VERSE nas posições e cores do drawSlide", () => {
    const drawing = drawSlide(VERSE, "MINIMAL");
    const theme = SLIDE_THEMES.MINIMAL;
    const { ctx, calls } = recorder();
    paintSlide(ctx, drawing, theme);

    // Fundo inteiro.
    expect(calls[0]).toMatchObject({ op: "fillRect", args: [0, 0, 1920, 1080], fillStyle: theme.background });

    // Traço e painel: roundRect com a geometria do drawSlide, preenchidos com a cor do papel.
    const rule = drawing.shapes.find((s) => s.role === "rule")!;
    const panel = drawing.shapes.find((s) => s.role === "panel")!;
    const rects = calls.filter((c) => c.op === "roundRect");
    expect(rects[0].args).toEqual([rule.x, rule.y, rule.width, rule.height, Math.min(rule.radius, rule.width / 2, rule.height / 2)]);
    expect(rects[1].args).toEqual([panel.x, panel.y, panel.width, panel.height, panel.radius]);
    const fills = calls.filter((c) => c.op === "fill");
    expect(fills.map((f) => f.fillStyle)).toEqual([theme.accent, theme.panel]);
    // Borda por dentro do painel (border-box).
    const b = panel.border!.width;
    expect(rects[2].args).toEqual([panel.x + b / 2, panel.y + b / 2, panel.width - b, panel.height - b, panel.radius - b / 2]);
    expect(calls.find((c) => c.op === "stroke")).toMatchObject({ strokeStyle: theme.border, lineWidth: b });

    // Textos: uma chamada por linha, na ordem do drawSlide, com a cor e o peso de cada um.
    const texts = calls.filter((c) => c.op === "fillText");
    const expected = drawing.texts.flatMap((t) => t.lines.map((line, j) => ({ t, j, text: line.map((r) => r.text).join("") })));
    expect(texts.map((c) => c.args[0])).toEqual(expected.map((e) => e.text));
    texts.forEach((c, i) => {
      const { t, j } = expected[i];
      const width = Array.from(String(c.args[0])).length * 10;
      // Centralizado na caixa (ou no início, se não couber).
      expect(c.args[1]).toBeCloseTo(t.x + Math.max(0, t.width - width) / 2, 5);
      // Linha de base como no CSS: meia entrelinha + ascendente.
      const top = t.y + j * t.lineHeight;
      expect(c.args[2]).toBeCloseTo(top + (t.lineHeight - 1.219 * t.fontSize) / 2 + 0.968 * t.fontSize, 5);
      expect(c.fillStyle).toBe(theme[t.color]);
      expect(c.font).toContain(`${t.weight} ${t.fontSize}px`);
      expect(c.font).toContain("Montserrat");
      expect(c.letterSpacing).toBe(`${t.letterSpacing}px`);
    });
    const roles = drawing.texts.map((t) => t.role);
    expect(roles).toEqual(["title", "quote", "verse", "reference"]);
    expect(texts.find((c) => c.args[0] === "João 8:12")!.fillStyle).toBe(theme.accent);
    expect(texts.find((c) => c.args[0] === "“")!.fillStyle).toBe(theme.accent);
  });

  it("sem roundRect nem letterSpacing no navegador, usa arcos e desenha letra a letra", () => {
    const drawing = drawSlide(VERSE, "BACKGROUND");
    const { ctx, calls } = recorder(false);
    delete (ctx as { roundRect?: unknown }).roundRect;
    paintSlide(ctx, drawing);
    expect(calls.some((c) => c.op === "roundRect")).toBe(false);
    expect(calls.filter((c) => c.op === "arcTo").length).toBeGreaterThan(0);
    const reference = drawing.texts.find((t) => t.role === "reference")!;
    expect(reference.letterSpacing).toBeGreaterThan(0);
    const letters = calls.filter((c) => c.op === "fillText" && String(c.args[0]).length === 1 && c.fillStyle === SLIDE_THEMES.BACKGROUND.accent);
    // A referência sai letra a letra, cada uma avançando largura + espaço.
    const ref = letters.filter((c) => "João 8:12".includes(String(c.args[0]))).slice(-"João 8:12".length);
    expect(ref.map((c) => c.args[0]).join("")).toBe("João 8:12");
    expect(Number(ref[1].args[1]) - Number(ref[0].args[1])).toBeCloseTo(10 + reference.letterSpacing, 5);
  });
});
