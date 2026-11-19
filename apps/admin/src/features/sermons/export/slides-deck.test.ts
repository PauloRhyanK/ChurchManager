import { describe, expect, it } from "vitest";
import type { SlideItem } from "../lib/slides";
import { buildDeck } from "./slides-deck";

const item = (over: Partial<SlideItem>): SlideItem => ({
  id: "x:0",
  kind: "VERSE",
  sourceBlockId: "x",
  text: "Texto",
  reference: "João 1:1",
  included: true,
  edited: false,
  ...over,
});

describe("buildDeck", () => {
  it("ignora desmarcados e privados, mesmo que o privado venha marcado, mantendo a ordem", () => {
    const deck = buildDeck(
      [
        item({ id: "a", text: "Primeiro" }),
        item({ id: "b", text: "Fora", included: false }),
        item({
          id: "c",
          kind: "PRIVATE",
          text: "Segredo",
          reference: null,
          included: true,
        }),
        item({ id: "d", kind: "POINT", text: "Segundo", reference: null }),
      ],
      "MINIMAL",
    );
    expect(deck.map((s) => s.text)).toEqual(["Primeiro", "Segundo"]);
  });

  it("aplica as cores dos dois visuais", () => {
    const [min] = buildDeck([item({})], "MINIMAL");
    const [bg] = buildDeck([item({})], "BACKGROUND");
    expect(min).toMatchObject({
      background: "#05070B",
      textColor: "#F5F6FA",
      referenceColor: "#A5ABBB",
    });
    expect(bg).toMatchObject({
      background: "#1E3A8A",
      textColor: "#F5F6FA",
      referenceColor: "#A5ABBB",
    });
  });

  it("negrito só fora do versículo e referência passa adiante", () => {
    const deck = buildDeck(
      [
        item({ kind: "TITLE", reference: null }),
        item({ kind: "POINT", reference: null }),
        item({ kind: "SUMMARY", reference: null }),
        item({ kind: "VERSE" }),
      ],
      "MINIMAL",
    );
    expect(deck.map((s) => s.bold)).toEqual([true, true, true, false]);
    expect(deck[0].reference).toBeNull();
    expect(deck[3].reference).toBe("João 1:1");
  });

  it("usa três tamanhos de fonte pelo comprimento do texto", () => {
    const size = (n: number) =>
      buildDeck([item({ text: "a".repeat(n) })], "MINIMAL")[0].fontSize;
    expect([
      size(1),
      size(60),
      size(61),
      size(140),
      size(141),
      size(220),
    ]).toEqual([44, 44, 32, 32, 24, 24]);
  });
});
