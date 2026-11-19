import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicSlide, SlideItem } from "../lib/slides";
import { SlidePreview } from "./SlidePreview";

const M04: PublicSlide = {
  kind: "VERSE",
  text: "Eu sou a luz do mundo.",
  layout: "M04",
  title: "A luz chama",
  subtitle: "Ninguém acha o caminho sozinho",
  verse: "Eu sou a luz do mundo.",
  reference: "João 8:12 · BLIVRE",
};

const card = () => screen.getByTestId("slide-card");
const frame = () => card().firstElementChild as HTMLElement;

describe("SlidePreview", () => {
  it("mostra título, subtítulo, versículo e a referência com a tradução, em negrito", () => {
    render(<SlidePreview slide={M04} style="MINIMAL" />);
    expect(screen.getByText("A luz chama")).toHaveAttribute("data-slide-role", "title");
    expect(screen.getByText("Ninguém acha o caminho sozinho")).toHaveAttribute("data-slide-role", "subtitle");
    expect(screen.getByText("Eu sou a luz do mundo.")).toHaveAttribute("data-slide-role", "verse");
    const ref = screen.getByText("João 8:12 · BLIVRE");
    expect(ref).toHaveAttribute("data-slide-role", "reference");
    expect(ref).toHaveStyle({ fontWeight: 700 });
  });

  it("título na fonte de título em itálico; o resto em Poppins; tamanhos e tracking do desenho", () => {
    render(<SlidePreview slide={M04} style="MINIMAL" />);
    const title = screen.getByText("A luz chama");
    expect(title.style.fontFamily).toContain("Playfair Display");
    expect(title).toHaveStyle({ fontStyle: "italic", fontWeight: 500 });
    expect(title.style.letterSpacing).toBe("-0.05em");
    expect(parseFloat(title.style.fontSize)).toBeGreaterThanOrEqual(85);
    expect(parseFloat(title.style.fontSize)).toBeLessThanOrEqual(115);
    const verse = screen.getByText("Eu sou a luz do mundo.");
    expect(verse.style.fontFamily).toContain("Poppins");
    expect(verse.style.letterSpacing).toBe("-0.03em");
  });

  it("desenha numa tela de 1920×1080 reduzida em escala para a largura pedida", () => {
    const { rerender } = render(<SlidePreview slide={M04} style="MINIMAL" size="sm" />);
    expect(card()).toHaveStyle({ width: "168px" });
    expect(frame()).toHaveStyle({ width: "1920px", height: "1080px", transform: `scale(${168 / 1920})` });
    rerender(<SlidePreview slide={M04} style="MINIMAL" size="lg" />);
    expect(frame().style.transform).toBe(`scale(${480 / 1920})`);
  });

  it("cores do visual: azul institucional, modelo 01 em azul profundo; verde profundo", () => {
    const title = { kind: "TITLE", text: "Luz", reference: null } as const;
    const { rerender } = render(<SlidePreview slide={M04} style="MINIMAL" />);
    expect(card()).toHaveStyle({ backgroundColor: "#334C71" });
    expect(frame()).toHaveStyle({ color: "#F1EBE2" });
    rerender(<SlidePreview slide={title} style="MINIMAL" />);
    expect(card()).toHaveStyle({ backgroundColor: "#182F5D" });
    rerender(<SlidePreview slide={M04} style="BACKGROUND" />);
    expect(card()).toHaveStyle({ backgroundColor: "#092A1E" });
    expect(frame()).toHaveStyle({ color: "#FFFFFF" });
  });

  it("cópia antiga (só kind, text e reference) vira o modelo padrão do tipo", () => {
    render(<SlidePreview slide={{ kind: "VERSE", text: "Eu sou a luz do mundo", reference: "João 8:12" }} style="MINIMAL" />);
    expect(screen.getByText("Eu sou a luz do mundo")).toHaveAttribute("data-slide-role", "verse");
    // M03 sem título de contexto: a referência é o título e também vai embaixo.
    expect(screen.getAllByText("João 8:12").map((e) => e.dataset.slideRole)).toEqual(["title", "reference"]);
  });

  it("item do editor usa o modelo e o subtítulo dele", () => {
    const item: SlideItem = {
      id: "p:0", kind: "POINT", sourceBlockId: "p", text: "A luz chama", reference: null, included: true, edited: false, subtitleEdited: false,
      layout: "M02", heading: null, subtitle: "Antes de procurar", version: null,
    };
    render(<SlidePreview slide={item} style="MINIMAL" />);
    expect(screen.getByText("Antes de procurar")).toHaveAttribute("data-slide-role", "subtitle");
  });

  it("texto acima do limite fica no mínimo da faixa e é cortado em linhas", () => {
    const long = "palavra ".repeat(37).trim();
    render(<SlidePreview slide={{ kind: "POINT", text: long, reference: null }} style="MINIMAL" />);
    const p = screen.getByText(long);
    expect(p.style.fontSize).toBe("100px");
    // As linhas mostradas (line-clamp) cabem na altura da área segura (700 px).
    const lines = Number(p.dataset.lines);
    expect(lines).toBeGreaterThanOrEqual(1);
    expect(lines * 100 * parseFloat(p.style.lineHeight)).toBeLessThanOrEqual(700);
    expect(p).toHaveClass("overflow-hidden");
  });
});
