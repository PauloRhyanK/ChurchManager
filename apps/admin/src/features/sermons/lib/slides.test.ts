import { describe, expect, it } from "vitest";
import type { SermonBlock, SermonDoc } from "./document";
import { EXAMPLE_DOC } from "./sermon-example";
import {
  aiTargets,
  buildSlides,
  countSlides,
  publicSlides,
  slideFace,
  splitFaceForLimits,
  splitText,
  splitVerse,
  summaryTargets,
  SLIDE_MODEL_LIMITS,
  type AiDecision,
  type SlideItem,
} from "./slides";

// Os mesmos valores do teste da API (apps/api/src/modules/sermons/sermon-slides.spec.ts): os dois lados com o mesmo exemplo.

const verseBlock = (id: string, reference: string, verses: { number: number | null; text: string }[]): SermonBlock => ({
  type: "verse",
  attrs: { id, reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses },
});
const doc = (...content: SermonBlock[]): SermonDoc => ({ type: "doc", content });
const point = (id: string, text: string): SermonBlock => ({ type: "point", attrs: { id }, content: text ? [{ type: "text", text }] : [] });
const item = (id: string, over: Partial<SlideItem> = {}): SlideItem => ({
  id,
  kind: "POINT",
  sourceBlockId: id.split(":")[0],
  text: `texto ${id}`,
  reference: null,
  included: true,
  edited: false,
  subtitleEdited: false,
  layout: "M01",
  heading: null,
  subtitle: null,
  version: null,
  ...over,
});

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

  it("bloco com vários versículos numera a referência e os ids", () => {
    const d = doc(verseBlock("v9", "Mateus 5:14-16", [{ number: 14, text: "a" }, { number: 15, text: "b" }, { number: 16, text: "c" }]));
    expect(buildSlides("", d, "VERSES").map((x) => [x.id, x.reference])).toEqual([
      ["v9:0", "Mateus 5:14"],
      ["v9:1", "Mateus 5:15"],
      ["v9:2", "Mateus 5:16"],
    ]);
  });

  it("divide versículo longo em pedaços de até 220 que terminam em pontuação", () => {
    const sentence = "Esta é uma frase de tamanho médio que se repete para encher o texto do versículo longo.";
    const text = Array(6).fill(sentence).join(" ");
    const s = buildSlides("", doc(verseBlock("v1", "João 1:1", [{ number: 1, text }])), "VERSES");
    expect(s.length).toBeGreaterThan(1);
    for (const x of s) {
      expect(x.text.length).toBeLessThanOrEqual(220);
      expect(x.text).toMatch(/[.;:?!]$/);
    }
    expect(s.map((x) => x.text).join(" ")).toBe(text);
  });

  it("corta no último espaço quando a frase passa de 220 e seco quando não há espaço", () => {
    const words = Array(80).fill("palavra").join(" ");
    const a = buildSlides("", doc(verseBlock("v1", "João 1:1", [{ number: 1, text: words }])), "VERSES");
    expect(a.every((x) => x.text.length <= 220)).toBe(true);
    expect(a.map((x) => x.text).join(" ")).toBe(words);
    const b = buildSlides("", doc(verseBlock("v1", "João 1:1", [{ number: 1, text: "x".repeat(500) }])), "VERSES");
    expect(b.map((x) => x.text.length)).toEqual([220, 220, 60]);
  });

  it("título vazio não gera TITLE; documento vazio dá []", () => {
    expect(buildSlides("   ", EXAMPLE_DOC, "VERSES_AND_POINTS").some((x) => x.kind === "TITLE")).toBe(false);
    expect(buildSlides("T", doc(), "VERSES_AND_POINTS").map((x) => x.kind)).toEqual(["TITLE"]);
    expect(buildSlides("", doc(), "VERSES")).toEqual([]);
  });

  it("título de 120 vira dois TITLE de até 75; ponto de 200 vira três POINT de até 75, todos M01, sem perder texto", () => {
    const title = Array(15).fill("palavra").join(" ");
    const pointText = Array(25).fill("palavra").join(" ");
    const s = buildSlides(title, doc(point("p", pointText)), "VERSES_AND_POINTS");
    expect(s.map((x) => [x.id, x.kind, x.layout])).toEqual([
      ["title", "TITLE", "M01"],
      ["title:1", "TITLE", "M01"],
      ["p:0", "POINT", "M01"],
      ["p:1", "POINT", "M01"],
      ["p:2", "POINT", "M01"],
    ]);
    expect(s.every((x) => Array.from(x.text).length <= 75 && !x.text.endsWith("…"))).toBe(true);
    expect(s.slice(0, 2).map((x) => x.text).join(" ")).toBe(title);
    expect(s.slice(2).map((x) => x.text).join(" ")).toBe(pointText);
  });

  it("texto sem espaço e com emoji é dividido sem partir caractere", () => {
    const s = buildSlides("", doc(point("p", "😀".repeat(400))), "VERSES_AND_POINTS");
    expect(s.map((x) => Array.from(x.text).length)).toEqual([75, 75, 75, 75, 75, 25]);
  });

  it("ponto de 75 fica inteiro; de 76 vira dois", () => {
    expect(buildSlides("", doc(point("p", "a".repeat(75))), "VERSES_AND_POINTS")).toHaveLength(1);
    expect(buildSlides("", doc(point("p", "a".repeat(76))), "VERSES_AND_POINTS")).toHaveLength(2);
  });
});

describe("modelos padrão sem IA (iguais à API)", () => {
  it("TITLE e POINT em M01; VERSE em M03 com o ponto atual (antes do primeiro, o título) e a versão do bloco", () => {
    const s = buildSlides("Luz", EXAMPLE_DOC, "VERSES_AND_POINTS");
    expect(s.map((x) => [x.id, x.layout, x.heading, x.subtitle, x.version])).toEqual([
      ["title", "M01", null, null, null],
      ["v1:0", "M03", "Luz", null, "BLIVRE"],
      ["pt1:0", "M01", null, null, null],
      ["v2:0", "M03", "A luz chama", null, "BLIVRE"],
      ["pt2:0", "M01", null, null, null],
      ["n1:0", "M01", null, null, null],
    ]);
  });

  it("título de contexto de 80 é cortado na última palavra que cabe, com reticências, em até 50", () => {
    const long = Array(10).fill("palavra").join(" ") + "x";
    const s = buildSlides("", doc(point("p", long), verseBlock("v", "João 1:1", [{ number: 1, text: "Curto." }])), "VERSES");
    expect(s[0].heading).toBe(Array(6).fill("palavra").join(" ") + "…");
  });

  it("os limites são os do manual", () => {
    expect(SLIDE_MODEL_LIMITS).toEqual({
      M01: { title: 75 },
      M02: { title: 60, subtitle: 150 },
      M03: { title: 50, verse: 220 },
      M04: { title: 45, subtitle: 90, verse: 160 },
    });
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
const D = (text: string, layout: AiDecision["layout"] = "M02"): AiDecision => ({ layout, text });

describe("FULL, summaryTargets e aiTargets (mesmos valores da API)", () => {
  const decisions = { "opening:0": D("Abre"), "i1:0": D("Lanterna"), "a1:0": D("Aplica"), "h1:0": D("Conclui") };

  it("cada SUMMARY fica na posição do alvo, em M02, com o título de contexto", () => {
    const s = buildSlides("Luz", FULL_DOC, "FULL", decisions);
    expect(s.map((x) => x.id)).toEqual(["title", "opening:0", "v1:0", "pt1:0", "v2:0", "i1:0", "pt2:0", "a1:0", "h1:0", "n1:0", "n2:0"]);
    expect(s.find((x) => x.id === "h1:0")).toEqual({
      id: "h1:0", kind: "SUMMARY", sourceBlockId: "h1", text: "Conclui", reference: null, included: true, edited: false, subtitleEdited: false,
      layout: "M02", heading: "Conclusão", subtitle: null, version: null,
    });
    expect(s.filter((x) => x.kind === "SUMMARY").map((x) => [x.id, x.heading])).toEqual([
      ["opening:0", "Luz"], ["i1:0", "A luz chama"], ["a1:0", "A luz mostra"], ["h1:0", "Conclusão"],
    ]);
  });

  it("sem decisões, FULL é igual a versículos e pontos; countSlides.FULL = versículos e pontos + alvos", () => {
    expect(buildSlides("Luz", FULL_DOC, "FULL")).toEqual(buildSlides("Luz", FULL_DOC, "VERSES_AND_POINTS"));
    const c = countSlides("Luz", FULL_DOC);
    expect(c.FULL).toBe(c.VERSES_AND_POINTS + 4);
  });

  it("M02 num ponto põe o subtítulo; M04 num versículo curto põe o subtítulo e mantém o texto", () => {
    const s = buildSlides("Luz", FULL_DOC, "FULL", { "pt1:0": D("Ninguém acha o caminho sozinho"), v1: D("A luz que guia", "M04") });
    const pt = s.find((x) => x.id === "pt1:0")!;
    expect([pt.layout, pt.text, pt.subtitle, pt.heading]).toEqual(["M02", "A luz chama", "Ninguém acha o caminho sozinho", null]);
    const v = s.find((x) => x.id === "v1:0")!;
    expect([v.layout, v.subtitle, v.heading, v.version, v.reference]).toEqual(["M04", "A luz que guia", "Luz", "BLIVRE", "João 8:12"]);
    expect(v.text).toBe("Eu sou a luz do mundo; quem me segue não andará em trevas.");
  });

  it("M04 num versículo de 300: <id>:lead em M02 e os pedaços em M03, nenhum M04", () => {
    const sentence = "Esta é uma frase de tamanho médio que se repete para encher o texto do versículo longo.";
    const text = [sentence, sentence, sentence].join(" ") + " Fim do versículo aqui.";
    const s = buildSlides("Luz", doc(point("p", "A luz chama"), verseBlock("v", "João 1:1", [{ number: 1, text }])), "FULL", { v: D("Liga", "M04") });
    expect(s.map((x) => [x.id, x.kind, x.layout])).toEqual([
      ["title", "TITLE", "M01"], ["p:0", "POINT", "M01"], ["v:lead", "SUMMARY", "M02"], ["v:0", "VERSE", "M03"], ["v:1", "VERSE", "M03"],
    ]);
  });

  it("M04 num bloco de vários versículos curtos: só o primeiro leva o subtítulo", () => {
    const d = doc(verseBlock("v", "Mateus 5:14-15", [{ number: 14, text: "Vós sois a luz do mundo." }, { number: 15, text: "Nem se acende a candeia." }]));
    expect(buildSlides("Luz", d, "FULL", { v: D("Liga", "M04") }).map((x) => [x.id, x.layout, x.subtitle])).toEqual([
      ["title", "M01", null], ["v:0", "M04", "Liga"], ["v:1", "M03", null],
    ]);
  });

  it("alvos de resumo e da IA na ordem do documento, sem texto de 'Só para mim'", () => {
    expect(summaryTargets(FULL_DOC).map((x) => [x.id, x.part])).toEqual([
      ["opening:0", "OPENING"], ["i1:0", "ILLUSTRATION"], ["a1:0", "APPLICATION"], ["h1:0", "SECTION"],
    ]);
    expect(summaryTargets(FULL_DOC)[3].text).toBe(`${CONCLUSION} Lembre disso.`);
    expect(aiTargets(FULL_DOC).map((x) => [x.id, x.part])).toEqual([
      ["opening:0", "OPENING"], ["v1", "VERSE"], ["pt1:0", "POINT"], ["v2", "VERSE"], ["i1:0", "ILLUSTRATION"], ["pt2:0", "POINT"], ["a1:0", "APPLICATION"], ["h1:0", "SECTION"],
    ]);
    expect(JSON.stringify(aiTargets(FULL_DOC)).includes("SEGREDO")).toBe(false);
  });
});

describe("slideFace e publicSlides (iguais à API)", () => {
  it("os quatro modelos", () => {
    expect(slideFace(item("t", { kind: "TITLE", text: "Luz" }))).toEqual({ layout: "M01", title: "Luz", subtitle: null, verse: null, reference: null });
    expect(slideFace(item("p:0", { text: "A luz chama", layout: "M02", subtitle: "Antes de procurar" }))).toEqual({
      layout: "M02", title: "A luz chama", subtitle: "Antes de procurar", verse: null, reference: null,
    });
    expect(slideFace(item("h:0", { kind: "SUMMARY", text: "Frase", layout: "M02", heading: "Conclusão" }))).toEqual({
      layout: "M02", title: "Conclusão", subtitle: "Frase", verse: null, reference: null,
    });
    expect(slideFace(item("v:0", { kind: "VERSE", text: "Eu sou a luz.", reference: "João 8:12", layout: "M03", heading: "A luz chama", version: "BLIVRE" }))).toEqual({
      layout: "M03", title: "A luz chama", subtitle: null, verse: "Eu sou a luz.", reference: "João 8:12 · BLIVRE",
    });
    expect(slideFace(item("v:0", { kind: "VERSE", text: "Eu sou a luz.", reference: "João 8:12", layout: "M04", heading: "A luz", subtitle: "Guia" }))).toEqual({
      layout: "M04", title: "A luz", subtitle: "Guia", verse: "Eu sou a luz.", reference: "João 8:12",
    });
  });

  it("M02 e M04 sem subtítulo viram M01 e M03; item antigo recebe o padrão do tipo", () => {
    expect(slideFace(item("p:0", { layout: "M02", subtitle: null })).layout).toBe("M01");
    expect(slideFace(item("v:0", { kind: "VERSE", reference: "João 1:1", layout: "M04", heading: "X" })).layout).toBe("M03");
    expect(slideFace({ kind: "VERSE", text: "Eu sou a luz.", reference: "João 8:12" })).toEqual({
      layout: "M03", title: "João 8:12", subtitle: null, verse: "Eu sou a luz.", reference: "João 8:12",
    });
    expect(slideFace({ kind: "SUMMARY", text: "Frase", reference: null })).toEqual({ layout: "M02", title: "", subtitle: "Frase", verse: null, reference: null });
  });

  it("publicSlides devolve kind, text e os campos de slideFace, sem desmarcados e privados", () => {
    const items = [
      item("v:0", { kind: "VERSE", text: "Eu sou a luz.", reference: "João 8:12", layout: "M03", heading: "Luz", version: "BLIVRE" }),
      item("p:0", { text: "A luz chama", layout: "M02", subtitle: "Sub" }),
      item("b:0", { included: false }),
      item("n:0", { kind: "PRIVATE", included: true }),
    ];
    expect(publicSlides(items)).toEqual([
      { kind: "VERSE", text: "Eu sou a luz.", layout: "M03", title: "Luz", subtitle: null, verse: "Eu sou a luz.", reference: "João 8:12 · BLIVRE" },
      { kind: "POINT", text: "A luz chama", layout: "M02", title: "A luz chama", subtitle: "Sub", verse: null, reference: null },
    ]);
  });
});

describe("splitFaceForLimits e publicSlides com linha antiga (iguais à API)", () => {
  it("título de M01 acima de 75 e subtítulo de M02 acima de 150 viram faces seguidas; o resto fica igual", () => {
    const long = Array(25).fill("palavra").join(" ");
    const titles = splitFaceForLimits({ layout: "M01", title: long, subtitle: null, verse: null, reference: null });
    expect(titles.map((f) => f.title).join(" ")).toBe(long);
    expect(titles.every((f) => f.layout === "M01" && Array.from(f.title).length <= 75)).toBe(true);
    const subs = splitFaceForLimits({ layout: "M02", title: "Conclusão", subtitle: long, verse: null, reference: null });
    expect(subs.map((f) => [f.title, f.subtitle!.length <= 150])).toEqual([["Conclusão", true], ["Conclusão", true]]);
    const face = slideFace(item("v:0", { kind: "VERSE", text: "Eu sou a luz.", reference: "João 8:12", layout: "M03", heading: "Luz" }));
    expect(splitFaceForLimits(face)).toEqual([face]);
  });

  it("publicSlides divide o ponto antigo de 199 em três slides M01", () => {
    const long = Array(25).fill("palavra").join(" ");
    const s = publicSlides([item("p:0", { text: long })]);
    expect(s.map((x) => [x.kind, x.layout])).toEqual([["POINT", "M01"], ["POINT", "M01"], ["POINT", "M01"]]);
    expect(s.map((x) => x.text).join(" ")).toBe(long);
  });
});

describe("splitText e splitVerse (a regra da API, exportada para a apresentação)", () => {
  it("splitText corta no último espaço e seco sem espaço", () => {
    expect(splitText(Array(15).fill("palavra").join(" "), 75)).toEqual([Array(9).fill("palavra").join(" "), Array(6).fill("palavra").join(" ")]);
    expect(splitText("😀".repeat(80), 75).map((x) => Array.from(x).length)).toEqual([75, 5]);
  });

  it("splitVerse corta em frases até o limite", () => {
    expect(splitVerse("Um dois. Três quatro.", 10)).toEqual(["Um dois.", "Três", "quatro."]);
    expect(splitVerse("Curto.", 220)).toEqual(["Curto."]);
  });
});
