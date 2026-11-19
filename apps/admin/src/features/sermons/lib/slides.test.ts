import { describe, expect, it } from "vitest";
import type { SermonBlock, SermonDoc } from "./document";
import { buildSlides, countSlides, publicSlides, SLIDE_LIMITS, summaryTargets } from "./slides";
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
    expect(countSlides("Luz", EXAMPLE_DOC)).toEqual({ VERSES: 2, VERSES_AND_POINTS: 5, FULL: 8 });
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

const para = (text: string): SermonBlock => ({ type: "paragraph", content: [{ type: "text", text }] });
const inner = (type: "illustration" | "application" | "privateNote", id: string, text: string): SermonBlock => ({
  type,
  attrs: { id },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const heading = (id: string, text: string, level: 2 | 3 = 2): SermonBlock => ({ type: "heading", attrs: { id, level }, content: [{ type: "text", text }] });

const OPENING = "Quando eu era criança a luz acabava toda semana e a casa inteira ficava parada esperando alguém achar a vela.";
const CONCLUSION = "Saia daqui hoje sabendo que a luz que chama é a mesma que mostra o caminho de cada dia.";
const SECRET = "SEGREDO do pregador que nunca sai daqui";
const FULL_DOC: SermonDoc = {
  type: "doc",
  content: [
    para(OPENING),
    ...EXAMPLE_DOC.content,
    inner("illustration", "i2", "Uma vela acesa."),
    heading("h1", "Conclusão"),
    para(CONCLUSION),
    inner("privateNote", "n2", SECRET),
    heading("h3", "Subtítulo de nível três", 3),
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Lembre disso." }] }] }] },
  ],
};

describe("summaryTargets e FULL (mesmos valores da API)", () => {
  const summaries = { "opening:0": "Abre", "i1:0": "Lanterna", "a1:0": "Aplica", "h1:0": "Conclui" };

  it("alvos na ordem do documento, sem texto de 'Só para mim'", () => {
    const t = summaryTargets(FULL_DOC);
    expect(t.map((x) => [x.id, x.sourceBlockId, x.part, x.label])).toEqual([
      ["opening:0", null, "OPENING", "Abertura"],
      ["i1:0", "i1", "ILLUSTRATION", "Ilustração"],
      ["a1:0", "a1", "APPLICATION", "Aplicação"],
      ["h1:0", "h1", "SECTION", "Conclusão"],
    ]);
    expect(t[3].text).toBe(`${CONCLUSION} Lembre disso.`);
    expect(t.every((x) => !x.text.includes("SEGREDO"))).toBe(true);
  });

  it("cada SUMMARY fica na posição do alvo", () => {
    const s = buildSlides("Luz", FULL_DOC, "FULL", summaries);
    expect(s.map((x) => [x.id, x.kind])).toEqual([
      ["title", "TITLE"],
      ["opening:0", "SUMMARY"],
      ["v1:0", "VERSE"],
      ["pt1:0", "POINT"],
      ["v2:0", "VERSE"],
      ["i1:0", "SUMMARY"],
      ["pt2:0", "POINT"],
      ["a1:0", "SUMMARY"],
      ["h1:0", "SUMMARY"],
      ["n1:0", "PRIVATE"],
      ["n2:0", "PRIVATE"],
    ]);
    expect(s.find((x) => x.id === "h1:0")).toEqual({ id: "h1:0", kind: "SUMMARY", sourceBlockId: "h1", text: "Conclui", reference: null, included: true, edited: false });
  });

  it("sem summaries, FULL é igual a versículos e pontos; frase de id que não é alvo é ignorada", () => {
    expect(buildSlides("Luz", FULL_DOC, "FULL")).toEqual(buildSlides("Luz", FULL_DOC, "VERSES_AND_POINTS"));
    expect(buildSlides("Luz", FULL_DOC, "FULL", { "pt1:0": "não" }).some((x) => x.kind === "SUMMARY")).toBe(false);
  });

  it("countSlides.FULL = versículos e pontos + alvos", () => {
    const c = countSlides("Luz", FULL_DOC);
    expect(c.FULL).toBe(c.VERSES_AND_POINTS + 4);
  });
});
