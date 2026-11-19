import { describe, expect, it } from "vitest";
import { drawSlide } from "../lib/slide-layout";
import { slideFace, type SlideItem } from "../lib/slides";
import { buildDeck } from "./slides-deck";

const item = (over: Partial<SlideItem>): SlideItem => ({
  id: "x:0",
  kind: "VERSE",
  sourceBlockId: "x",
  text: "Texto",
  reference: "João 1:1",
  included: true,
  edited: false,
  subtitleEdited: false,
  layout: "M03",
  heading: "A luz chama",
  subtitle: null,
  version: "BLIVRE",
  ...over,
});
const point = (text: string, over: Partial<SlideItem> = {}) =>
  item({ kind: "POINT", text, reference: null, layout: "M01", heading: null, version: null, ...over });

describe("buildDeck", () => {
  it("um slide por item marcado e não privado, na ordem, mesmo que o privado venha marcado", () => {
    const deck = buildDeck(
      [
        item({ id: "a", text: "Primeiro" }),
        item({ id: "b", text: "Fora", included: false }),
        item({ id: "c", kind: "PRIVATE", text: "Segredo", reference: null, layout: "M01", heading: null, included: true }),
        point("Segundo", { id: "d" }),
      ],
      "MINIMAL",
    );
    expect(deck).toHaveLength(2);
    expect(deck.map((d) => d.blocks.map((b) => b.text))).toEqual([
      ["A luz chama", "Primeiro", "João 1:1 · BLIVRE"],
      ["Segundo"],
    ]);
    expect(JSON.stringify(deck).includes("Segredo")).toBe(false);
  });

  it("cada slide é o desenho de drawSlide da face do item, no visual escolhido", () => {
    const items = [item({}), point("A luz chama", { layout: "M02", subtitle: "Antes de procurar" })];
    for (const style of ["MINIMAL", "BACKGROUND"] as const) {
      expect(buildDeck(items, style)).toEqual(items.map((i) => drawSlide(slideFace(i), style)));
    }
    expect(buildDeck([point("Luz")], "MINIMAL")[0].background).toBe("#182F5D");
    expect(buildDeck([item({})], "BACKGROUND")[0]).toMatchObject({ background: "#092A1E", color: "#FFFFFF" });
  });

  it("texto acima do limite do modelo (dado antigo ou editado) vira mais slides com a regra da API", () => {
    const long = Array(25).fill("palavra").join(" "); // 199 caracteres
    const deck = buildDeck([point(long)], "MINIMAL");
    expect(deck.map((d) => d.layout)).toEqual(["M01", "M01", "M01"]);
    expect(deck.map((d) => d.blocks[0].text).join(" ")).toBe(long);
    expect(deck.every((d) => Array.from(d.blocks[0].text).length <= 75)).toBe(true);
    expect(deck.every((d) => d.blocks[0].fontSize >= 100)).toBe(true);
    const summary = Array(40).fill("frase").join(" "); // 239: resumo antigo acima de 150
    const two = buildDeck([item({ kind: "SUMMARY", text: summary, reference: null, layout: "M02", heading: "Conclusão", version: null })], "MINIMAL");
    expect(two.map((d) => d.blocks.map((b) => b.role))).toEqual([["title", "subtitle"], ["title", "subtitle"]]);
    expect(two.map((d) => d.blocks[1].text).join(" ")).toBe(summary);
  });

  it("fidelidade: o bloco do versículo é o texto do item e a referência leva a tradução, em negrito", () => {
    const verse = "Vós sois a luz do mundo; não se pode esconder a cidade edificada sobre um monte. Nem se acende a candeia e se coloca debaixo do alqueire, mas no velador, e dá luz a todos que estão na casa.";
    expect(verse.length).toBeLessThanOrEqual(220);
    const [d] = buildDeck([item({ id: "v:0", text: `  ${verse}  `, reference: "Mateus 5:14", version: "BLIVRE" })], "MINIMAL");
    const v = d.blocks.find((b) => b.role === "verse")!;
    const ref = d.blocks.find((b) => b.role === "reference")!;
    expect(v.text).toBe(verse);
    expect(ref).toMatchObject({ text: "Mateus 5:14 · BLIVRE", fontWeight: 700 });
  });
});
