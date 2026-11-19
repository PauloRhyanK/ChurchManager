import type { NodeViewProps } from "@tiptap/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VerseAttrs } from "../../lib/document";
import { VerseView } from "./VerseView";

function renderVerse(verses: VerseAttrs["verses"], translation: string | null = "BLIVRE") {
  const attrs: VerseAttrs = { id: "v1", reference: "Mateus 5:14-16", book: 40, chapter: 5, verseStart: 14, verseEnd: 16, translation, verses };
  const props = { node: { attrs }, editor: { isEditable: false }, selected: false, deleteNode: () => {} } as unknown as NodeViewProps;
  render(<VerseView {...props} />);
  return document.querySelector("blockquote")!;
}

describe("VerseView", () => {
  it("com mais de um versículo, cada um começa com o número em sobrescrito", () => {
    const quote = renderVerse([
      { number: 14, text: "Vós sois a luz do mundo." },
      { number: 15, text: "Nem se acende a candeia." },
      { number: 16, text: "Assim resplandeça a vossa luz." },
    ]);
    expect(Array.from(quote.querySelectorAll("sup")).map((s) => s.textContent)).toEqual(["14", "15", "16"]);
    expect(quote).toHaveTextContent("14 Vós sois a luz do mundo. 15 Nem se acende a candeia. 16 Assim resplandeça a vossa luz.");
  });

  it("com um só versículo, só o texto", () => {
    const quote = renderVerse([{ number: 14, text: "Vós sois a luz do mundo." }]);
    expect(quote.querySelector("sup")).toBeNull();
    expect(quote).toHaveTextContent(/^Vós sois a luz do mundo\.$/);
  });

  it("legenda mostra a tradução ao lado da referência; à mão, só a referência", () => {
    renderVerse([{ number: 14, text: "Vós sois a luz do mundo." }]);
    const caption = document.querySelector("figcaption")!;
    expect(caption).toHaveTextContent(/^Mateus 5:14-16 · BLIVRE$/);
    expect(caption.querySelector("span")).toHaveTextContent("· BLIVRE");
    document.body.innerHTML = "";
    renderVerse([{ number: null, text: "Texto." }], null);
    expect(document.querySelector("figcaption")).toHaveTextContent(/^Mateus 5:14-16$/);
  });
});
