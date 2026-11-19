import { describe, expect, it } from "vitest";
import type { SlideItem } from "./slides";
import { EDITABLE_KINDS, TEXT_LIMIT, editSlide, moveSlide, slidesBody, toggleSlide } from "./slide-edits";

const item = (id: string, kind: SlideItem["kind"], over: Partial<SlideItem> = {}): SlideItem => ({
  id,
  kind,
  sourceBlockId: id,
  text: `Texto ${id}`,
  reference: kind === "VERSE" ? "João 8:12" : null,
  included: kind !== "PRIVATE",
  edited: false,
  layout: kind === "VERSE" ? "VERSE" : kind === "SUMMARY" ? "BULLETS" : "TITLE",
  heading: kind === "VERSE" || kind === "SUMMARY" ? "1. A luz" : null,
  items: kind === "SUMMARY" ? ["Um", "Dois"] : null,
  start: null,
  version: null,
  ...over,
});

const LIST: SlideItem[] = [item("title", "TITLE"), item("v:0", "VERSE"), item("p:0", "POINT"), item("s:0", "SUMMARY"), item("n:0", "PRIVATE")];
const ids = (items: SlideItem[]) => items.map((i) => i.id);

describe("moveSlide", () => {
  it("leva o item para a posição do outro", () => {
    expect(ids(moveSlide(LIST, "p:0", "title"))).toEqual(["p:0", "title", "v:0", "s:0", "n:0"]);
    expect(ids(moveSlide(LIST, "title", "p:0"))).toEqual(["v:0", "p:0", "title", "s:0", "n:0"]);
  });

  it("item privado não se move nem recebe outro: a lista fica igual", () => {
    expect(moveSlide(LIST, "n:0", "title")).toBe(LIST);
    expect(moveSlide(LIST, "title", "n:0")).toBe(LIST);
  });

  it("id desconhecido ou o mesmo item não muda nada", () => {
    expect(moveSlide(LIST, "x", "title")).toBe(LIST);
    expect(moveSlide(LIST, "title", "title")).toBe(LIST);
  });

  it("privados ficam sempre no fim", () => {
    const mixed = [item("n:0", "PRIVATE"), item("a:0", "POINT"), item("b:0", "POINT")];
    expect(ids(moveSlide(mixed, "b:0", "a:0"))).toEqual(["b:0", "a:0", "n:0"]);
  });
});

describe("toggleSlide e editSlide", () => {
  it("desmarca e marca", () => {
    const off = toggleSlide(LIST, "v:0", false);
    expect(off.find((i) => i.id === "v:0")!.included).toBe(false);
    expect(toggleSlide(off, "v:0", true).find((i) => i.id === "v:0")!.included).toBe(true);
  });

  it("privado nunca fica marcado", () => {
    expect(toggleSlide(LIST, "n:0", true).find((i) => i.id === "n:0")!.included).toBe(false);
  });

  it("edita o texto de ponto e título (aparado) e marca como editado", () => {
    const next = editSlide(LIST, "p:0", "  Novo ponto  ");
    expect(next.find((i) => i.id === "p:0")).toMatchObject({ text: "Novo ponto", edited: true });
  });

  it("não edita versículo, lista, privado, texto vazio ou acima de 120", () => {
    expect(editSlide(LIST, "v:0", "x")).toBe(LIST);
    expect(editSlide(LIST, "s:0", "x")).toBe(LIST);
    expect(editSlide(LIST, "n:0", "x")).toBe(LIST);
    expect(editSlide(LIST, "p:0", "   ")).toBe(LIST);
    expect(editSlide(LIST, "p:0", "a".repeat(121))).toBe(LIST);
    expect(editSlide(LIST, "p:0", "a".repeat(120))).not.toBe(LIST);
    expect(editSlide(LIST, "p:0", "Texto p:0")).toBe(LIST);
  });
});

describe("o que se edita", () => {
  it("só Capa e Ponto, até 120 caracteres", () => {
    expect(EDITABLE_KINDS).toEqual(["TITLE", "POINT"]);
    expect(TEXT_LIMIT).toBe(120);
  });
});

describe("slidesBody", () => {
  it("leva só id, included e, quando editado, text; privado vai sempre desmarcado", () => {
    const list = [
      item("title", "TITLE", { edited: true, text: "Meu título" }),
      item("v:0", "VERSE", { included: false, edited: true }),
      item("s:0", "SUMMARY", { edited: true }),
      item("n:0", "PRIVATE", { included: true }),
    ];
    expect(slidesBody(list)).toEqual([
      { id: "title", included: true, text: "Meu título" },
      { id: "v:0", included: false },
      { id: "s:0", included: true },
      { id: "n:0", included: false },
    ]);
  });
});
