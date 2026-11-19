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
  layout: "VERSE",
  heading: "1. A luz chama",
  items: null,
  start: null,
  version: "BLIVRE",
  ...over,
});
const point = (text: string, over: Partial<SlideItem> = {}) =>
  item({ kind: "POINT", text, reference: null, layout: "TITLE", heading: null, version: null, ...over });
const texts = (d: ReturnType<typeof buildDeck>[number]) => d.texts.map((t) => t.lines.map((l) => l.map((r) => r.text).join("")).join(" "));

describe("buildDeck", () => {
  it("um slide por item marcado e não privado, na ordem, mesmo que o privado venha marcado", () => {
    const deck = buildDeck(
      [
        item({ id: "a", text: "Primeiro" }),
        item({ id: "b", text: "Fora", included: false }),
        item({ id: "c", kind: "PRIVATE", text: "Segredo", reference: null, layout: "TITLE", heading: null, included: true }),
        point("2. Segundo", { id: "d" }),
      ],
      "MINIMAL",
    );
    expect(deck.map(texts)).toEqual([["1. A luz chama", "“", "Primeiro", "João 1:1"], ["2. Segundo"]]);
    expect(JSON.stringify(deck).includes("Segredo")).toBe(false);
  });

  it("cada slide é o desenho de drawSlide da face do item, na variação escolhida; a referência sai sem a tradução", () => {
    const items = [item({}), point("A luz chama")];
    for (const style of ["MINIMAL", "BACKGROUND"] as const) {
      expect(buildDeck(items, style)).toEqual(items.map((i) => drawSlide(slideFace(i), style)));
    }
    expect(buildDeck([item({})], "BACKGROUND")[0].theme.background).toBe("#11223B");
    expect(JSON.stringify(buildDeck([item({})], "MINIMAL")).includes("BLIVRE")).toBe(false);
  });
});
