import { describe, expect, it } from "vitest";
import type { SlideItem } from "./slides";
import { editSlide, editSubtitle, moveSlide, slidesBody, subtitleLimit, textLimit, toggleSlide } from "./slide-edits";

const item = (id: string, kind: SlideItem["kind"], over: Partial<SlideItem> = {}): SlideItem => ({
  id,
  kind,
  sourceBlockId: id,
  text: `Texto ${id}`,
  reference: kind === "VERSE" ? "João 8:12" : null,
  included: kind !== "PRIVATE",
  edited: false,
  subtitleEdited: false,
  layout: kind === "VERSE" ? "M03" : kind === "SUMMARY" ? "M02" : "M01",
  heading: null,
  subtitle: null,
  version: null,
  ...over,
});

const LIST: SlideItem[] = [item("title", "TITLE"), item("v:0", "VERSE"), item("p:0", "POINT"), item("n:0", "PRIVATE")];
const ids = (items: SlideItem[]) => items.map((i) => i.id);

describe("moveSlide", () => {
  it("leva o item para a posição do outro", () => {
    expect(ids(moveSlide(LIST, "p:0", "title"))).toEqual(["p:0", "title", "v:0", "n:0"]);
    expect(ids(moveSlide(LIST, "title", "p:0"))).toEqual(["v:0", "p:0", "title", "n:0"]);
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

  it("não edita versículo, privado, texto vazio ou acima do limite do modelo", () => {
    expect(editSlide(LIST, "v:0", "x")).toBe(LIST);
    expect(editSlide(LIST, "n:0", "x")).toBe(LIST);
    expect(editSlide(LIST, "p:0", "   ")).toBe(LIST);
    expect(editSlide(LIST, "p:0", "a".repeat(76))).toBe(LIST);
    expect(editSlide(LIST, "p:0", "a".repeat(75))).not.toBe(LIST);
    expect(editSlide(LIST, "p:0", "Texto p:0")).toBe(LIST);
  });
});

describe("limites do modelo", () => {
  it("texto: título e ponto 75 (60 com subtítulo); resumo 150", () => {
    expect(textLimit(item("t", "TITLE"))).toBe(75);
    expect(textLimit(item("p", "POINT"))).toBe(75);
    expect(textLimit(item("p", "POINT", { layout: "M02", subtitle: "Sub" }))).toBe(60);
    expect(textLimit(item("s", "SUMMARY"))).toBe(150);
  });

  it("subtítulo: ponto 150 até 60 caracteres de título; versículo 90 no primeiro pedaço até 160; nos outros, nenhum", () => {
    expect(subtitleLimit(item("p:0", "POINT"))).toBe(150);
    expect(subtitleLimit(item("p:0", "POINT", { text: "a".repeat(61) }))).toBeNull();
    expect(subtitleLimit(item("v:0", "VERSE"))).toBe(90);
    expect(subtitleLimit(item("v:0", "VERSE", { text: "a".repeat(161) }))).toBeNull();
    expect(subtitleLimit(item("v:1", "VERSE"))).toBeNull();
    expect(subtitleLimit(item("t", "TITLE"))).toBeNull();
    expect(subtitleLimit(item("s", "SUMMARY"))).toBeNull();
  });
});

describe("editSubtitle", () => {
  it("põe o subtítulo e troca o modelo (ponto 02, versículo 04) sem marcar o item como editado", () => {
    const next = editSubtitle(LIST, "p:0", "  Antes de procurar ");
    expect(next.find((i) => i.id === "p:0")).toMatchObject({ subtitle: "Antes de procurar", layout: "M02", edited: false, subtitleEdited: false });
    expect(editSubtitle(LIST, "v:0", "Liga").find((i) => i.id === "v:0")).toMatchObject({ subtitle: "Liga", layout: "M04" });
  });

  it("vazio remove e volta a 01/03; igual, acima do limite ou tipo sem subtítulo não muda", () => {
    const withSub = editSubtitle(LIST, "p:0", "Sub");
    expect(editSubtitle(withSub, "p:0", " ").find((i) => i.id === "p:0")).toMatchObject({ subtitle: null, layout: "M01" });
    expect(editSubtitle(withSub, "p:0", "Sub")).toBe(withSub);
    expect(editSubtitle(LIST, "p:0", "")).toBe(LIST);
    expect(editSubtitle(LIST, "p:0", "a".repeat(151))).toBe(LIST);
    expect(editSubtitle(LIST, "v:0", "a".repeat(91))).toBe(LIST);
    expect(editSubtitle(LIST, "title", "Sub")).toBe(LIST);
  });
});

describe("slidesBody", () => {
  it("leva subtitle de ponto e versículo só quando mudou em relação ao que está gravado ('' remove)", () => {
    const saved = [item("p:0", "POINT", { layout: "M02", subtitle: "Velho" }), item("v:0", "VERSE"), item("q:0", "POINT")];
    const local = [item("p:0", "POINT"), item("v:0", "VERSE", { layout: "M04", subtitle: "Liga" }), item("q:0", "POINT")];
    expect(slidesBody(local, saved)).toEqual([
      { id: "p:0", included: true, subtitle: "" },
      { id: "v:0", included: true, subtitle: "Liga" },
      { id: "q:0", included: true },
    ]);
  });

  it("leva só id, included e, quando editado, text; privado vai sempre desmarcado", () => {
    const list = [item("title", "TITLE", { edited: true, text: "Meu título" }), item("v:0", "VERSE", { included: false }), item("n:0", "PRIVATE", { included: true })];
    expect(slidesBody(list)).toEqual([
      { id: "title", included: true, text: "Meu título" },
      { id: "v:0", included: false },
      { id: "n:0", included: false },
    ]);
  });
});
