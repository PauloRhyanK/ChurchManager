import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicSlide, SlideItem } from "../lib/slides";
import { SlidePreview } from "./SlidePreview";

const VERSE: PublicSlide = {
  kind: "VERSE",
  text: "Eu sou a luz do mundo.",
  layout: "VERSE",
  title: "1. A luz chama",
  verse: "Eu sou a luz do mundo.",
  reference: "João 8:12",
  items: null,
  start: null,
};

const card = () => screen.getByTestId("slide-card");
const frame = () => screen.getByTestId("slide-frame");
const roleOf = (text: string) => screen.getByText(text).closest<HTMLElement>("[data-slide-role]")!;
const role = (r: string) => frame().querySelector<HTMLElement>(`[data-slide-role="${r}"]`)!;

describe("SlidePreview", () => {
  it("versículo: título, traço, painel, aspa, versículo e referência dourada em negrito com espaçamento", () => {
    render(<SlidePreview slide={VERSE} style="MINIMAL" />);
    expect(roleOf("1. A luz chama").dataset.slideRole).toBe("title");
    expect(roleOf("Eu sou a luz do mundo.").dataset.slideRole).toBe("verse");
    expect(roleOf("“").dataset.slideRole).toBe("quote");
    const ref = roleOf("João 8:12");
    expect(ref.dataset.slideRole).toBe("reference");
    expect(ref).toHaveStyle({ fontWeight: "700", color: "#E3B862", letterSpacing: "2px" });
    expect(role("rule")).toHaveStyle({ backgroundColor: "#E3B862", width: "120px", height: "6px", borderRadius: "3px" });
    expect(role("panel")).toHaveStyle({ backgroundColor: "#2C3F38", borderRadius: "28px", border: "2px solid #42584F", left: "210px", width: "1500px" });
  });

  it("Montserrat em tudo, título em 104 px e 800", () => {
    render(<SlidePreview slide={VERSE} style="MINIMAL" />);
    expect(frame().style.fontFamily).toContain("Montserrat");
    expect(roleOf("1. A luz chama")).toHaveStyle({ fontSize: "104px", fontWeight: "800", textAlign: "center" });
  });

  it("desenha numa tela de 1920×1080 reduzida em escala para a largura pedida", () => {
    const { rerender } = render(<SlidePreview slide={VERSE} style="MINIMAL" size="sm" />);
    expect(card()).toHaveStyle({ width: "168px" });
    expect(frame()).toHaveStyle({ width: "1920px", height: "1080px", transform: `scale(${168 / 1920})`, overflow: "hidden" });
    rerender(<SlidePreview slide={VERSE} style="MINIMAL" size="lg" />);
    expect(frame().style.transform).toBe(`scale(${480 / 1920})`);
  });

  it("cores das variações Verde e Azul-marinho", () => {
    const { rerender } = render(<SlidePreview slide={VERSE} style="MINIMAL" />);
    expect(card()).toHaveStyle({ backgroundColor: "#24352F" });
    expect(frame()).toHaveStyle({ color: "#F6F2EA" });
    rerender(<SlidePreview slide={VERSE} style="BACKGROUND" />);
    expect(card()).toHaveStyle({ backgroundColor: "#11223B" });
    expect(role("panel")).toHaveStyle({ backgroundColor: "#182D4B" });
  });

  it("lista numerada com os números dourados a partir de `start`; lista com a referência final em dourado negrito", () => {
    const { rerender } = render(
      <SlidePreview slide={{ kind: "SUMMARY", text: "A\nB", reference: null, layout: "NUMBERED", title: "Luz", verse: null, items: ["A", "B"], start: 4 }} style="MINIMAL" />,
    );
    expect(roleOf("4")).toHaveStyle({ color: "#E3B862", fontWeight: "800" });
    expect(roleOf("5").dataset.slideRole).toBe("marker");
    rerender(
      <SlidePreview slide={{ kind: "SUMMARY", text: "Pede-me (1 Reis 3:5)", reference: null, layout: "BULLETS", title: "Luz", verse: null, items: ["Pede-me (1 Reis 3:5)"], start: null }} style="MINIMAL" />,
    );
    expect(roleOf("•").dataset.slideRole).toBe("marker");
    expect(screen.getByText("(1 Reis 3:5)")).toHaveStyle({ color: "#E3B862", fontWeight: "700" });
  });

  it("slide só com título: sem painel", () => {
    render(<SlidePreview slide={{ kind: "POINT", text: "2. A luz", reference: null }} style="MINIMAL" />);
    expect(roleOf("2. A luz").dataset.slideRole).toBe("title");
    expect(role("panel")).toBeNull();
    expect(role("rule")).not.toBeNull();
  });

  it("item do editor e cópia antiga (modelo M04) viram a face do tipo", () => {
    const item: SlideItem = {
      id: "v:0", kind: "VERSE", sourceBlockId: "v", text: "Eu sou a luz", reference: "João 8:12", included: true, edited: false,
      layout: "VERSE", heading: "1. A luz", items: null, start: null, version: null,
    };
    const { rerender } = render(<SlidePreview slide={item} style="MINIMAL" />);
    expect(roleOf("1. A luz").dataset.slideRole).toBe("title");
    const old = { kind: "VERSE", text: "Eu sou a luz", reference: "João 8:12", layout: "M04", title: "A luz chama", subtitle: "x", verse: "Eu sou a luz" } as never;
    rerender(<SlidePreview slide={old} style="MINIMAL" />);
    expect(roleOf("A luz chama").dataset.slideRole).toBe("title");
    expect(roleOf("Eu sou a luz").dataset.slideRole).toBe("verse");
  });
});
