import { describe, expect, it } from "vitest";
import type { SermonBlock, SermonDoc } from "./document";
import { buildSlides, countSlides, publicSlides, SLIDE_LIMITS } from "./slides";
import { EXAMPLE_DOC } from "./sermon-example";

const doc = (...content: SermonBlock[]): SermonDoc => ({ type: "doc", content });
const verse = (id: string, reference: string, verses: { number: number | null; text: string }[]): SermonBlock => ({
  type: "verse",
  attrs: { id, reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses },
});

// Os mesmos valores do teste da API (sermon-slides.spec.ts): os dois lados com o mesmo exemplo.
describe("buildSlides (cópia da API)", () => {
  it("só versículos no exemplo, com a nota privada no fim desmarcada", () => {
    const s = buildSlides("Luz", EXAMPLE_DOC, "VERSES");
    expect(s.map((x) => [x.id, x.kind, x.reference, x.included])).toEqual([
      ["v1:0", "VERSE", "João 8:12", true],
      ["v2:0", "VERSE", "Salmos 119:105", true],
      ["n1:0", "PRIVATE", null, false],
    ]);
  });

  it("versículos e pontos: título, versículo, ponto, na ordem", () => {
    const s = buildSlides("  Luz  ", EXAMPLE_DOC, "VERSES_AND_POINTS");
    expect(s.map((x) => x.kind)).toEqual(["TITLE", "VERSE", "POINT", "VERSE", "POINT", "PRIVATE"]);
    expect(s[0]).toMatchObject({ id: "title", sourceBlockId: null, text: "Luz" });
    expect(s[2].text).toBe("A luz chama");
    expect(s[4].text).toBe("A luz mostra");
    expect(s[5].included).toBe(false);
    expect(s.every((x) => x.edited === false)).toBe(true);
  });

  it("countSlides não conta PRIVATE", () => {
    expect(countSlides("Luz", EXAMPLE_DOC)).toEqual({ VERSES: 2, VERSES_AND_POINTS: 5 });
  });

  it("título vazio não gera TITLE; documento vazio dá []", () => {
    expect(buildSlides("   ", EXAMPLE_DOC, "VERSES_AND_POINTS").some((x) => x.kind === "TITLE")).toBe(false);
    expect(buildSlides("", doc(), "VERSES")).toEqual([]);
  });

  it("bloco com vários versículos numera a referência e os ids", () => {
    const s = buildSlides("", doc(verse("v9", "Mateus 5:14-16", [{ number: 14, text: "a" }, { number: 15, text: "b" }])), "VERSES");
    expect(s.map((x) => [x.id, x.reference])).toEqual([["v9:0", "Mateus 5:14"], ["v9:1", "Mateus 5:15"]]);
  });

  it("divide versículo longo em pedaços de até 220; sem espaço corta seco", () => {
    const words = Array(80).fill("palavra").join(" ");
    const a = buildSlides("", doc(verse("v1", "João 1:1", [{ number: 1, text: words }])), "VERSES");
    expect(a.every((x) => x.text.length <= SLIDE_LIMITS.verseChars)).toBe(true);
    expect(a.map((x) => x.text).join(" ")).toBe(words);
    const b = buildSlides("", doc(verse("v1", "João 1:1", [{ number: 1, text: "x".repeat(500) }])), "VERSES");
    expect(b.map((x) => x.text.length)).toEqual([220, 220, 60]);
  });
});

describe("limite de texto (igual à API)", () => {
  const point = (id: string, text: string): SermonBlock => ({ type: "point", attrs: { id }, content: [{ type: "text", text }] });

  it("título e ponto passam de 300: corta no último espaço antes de 300, sem espaço no fim, com reticências", () => {
    const long = "palavra ".repeat(50).trim();
    const s = buildSlides(long, doc(point("p", long)), "VERSES_AND_POINTS");
    const expected = Array(37).fill("palavra").join(" ") + "…";
    expect(s[0]).toMatchObject({ kind: "TITLE", text: expected });
    expect(s[1].text).toBe(expected);
    expect(Array.from(s[1].text).length).toBeLessThanOrEqual(SLIDE_LIMITS.textChars);
  });

  it("texto sem espaço e com emoji é cortado sem partir caractere", () => {
    expect(buildSlides("", doc(point("p", "😀".repeat(400))), "VERSES_AND_POINTS")[0].text).toBe("😀".repeat(299) + "…");
  });

  it("ponto de até 300 fica inteiro", () => {
    expect(buildSlides("", doc(point("p", "a".repeat(300))), "VERSES_AND_POINTS")[0].text).toBe("a".repeat(300));
  });
});

describe("publicSlides", () => {
  it("devolve só os marcados e não privados", () => {
    const s = buildSlides("Luz", EXAMPLE_DOC, "VERSES_AND_POINTS");
    s[1] = { ...s[1], included: false };
    expect(publicSlides(s).map((x) => x.kind)).toEqual(["TITLE", "POINT", "VERSE", "POINT"]);
    expect(publicSlides(s)[0]).toEqual({ kind: "TITLE", text: "Luz", reference: null });
  });
});
