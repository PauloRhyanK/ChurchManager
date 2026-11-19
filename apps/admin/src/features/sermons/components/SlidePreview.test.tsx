import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlidePreview } from "./SlidePreview";

describe("SlidePreview", () => {
  it("mostra o texto e a referência do versículo", () => {
    render(<SlidePreview slide={{ kind: "VERSE", text: "Eu sou a luz do mundo.", reference: "João 8:12" }} style="MINIMAL" />);
    expect(screen.getByText("Eu sou a luz do mundo.")).toBeInTheDocument();
    expect(screen.getByText("João 8:12")).toBeInTheDocument();
  });

  it("não mostra referência quando não há", () => {
    const { container } = render(<SlidePreview slide={{ kind: "POINT", text: "A luz chama", reference: null }} style="MINIMAL" />);
    expect(screen.getByText("A luz chama")).toBeInTheDocument();
    expect(container.querySelector("[data-slide-reference]")).toBeNull();
  });

  it("o fundo muda conforme o visual", () => {
    const slide = { kind: "TITLE", text: "Luz", reference: null } as const;
    const { rerender } = render(<SlidePreview slide={slide} style="MINIMAL" />);
    expect(screen.getByTestId("slide-card")).toHaveStyle({ backgroundColor: "#05070B" });
    rerender(<SlidePreview slide={slide} style="BACKGROUND" />);
    expect(screen.getByTestId("slide-card")).toHaveStyle({ backgroundColor: "#1E3A8A" });
  });

  it("título, ponto e resumo em negrito; versículo com peso médio", () => {
    for (const kind of ["TITLE", "POINT", "SUMMARY"] as const) {
      const { unmount } = render(<SlidePreview slide={{ kind, text: "Texto", reference: null }} style="MINIMAL" />);
      expect(screen.getByText("Texto")).toHaveStyle({ fontWeight: 700 });
      unmount();
    }
    render(<SlidePreview slide={{ kind: "VERSE", text: "Texto", reference: "A 1:1" }} style="MINIMAL" />);
    expect(screen.getByText("Texto")).toHaveStyle({ fontWeight: 500 });
  });

  it("o texto diminui em quatro degraus conforme o comprimento", () => {
    const sizeOf = (n: number) => {
      const { unmount } = render(<SlidePreview slide={{ kind: "POINT", text: "a".repeat(n), reference: null }} style="MINIMAL" size="sm" />);
      const v = parseFloat(screen.getByText("a".repeat(n)).style.fontSize);
      unmount();
      return v;
    };
    const sizes = [sizeOf(40), sizeOf(120), sizeOf(180), sizeOf(220)];
    expect(new Set(sizes).size).toBe(4);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it("versículo longo cabe no cartão: a referência fica fora da área cortada e as linhas cabem na altura", () => {
    const text = "Nem se acende a candeia e se coloca debaixo do alqueire, mas no velador, e dá luz a todos que estão na casa.";
    render(<SlidePreview slide={{ kind: "VERSE", text, reference: "Mateus 5:15" }} style="MINIMAL" size="sm" />);
    const ref = screen.getByText("Mateus 5:15");
    const p = screen.getByText(text);
    expect(ref).toHaveClass("shrink-0");
    expect(p.contains(ref)).toBe(false);
    expect(p.parentElement).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    const lines = Number(p.dataset.lines);
    expect(lines).toBeGreaterThanOrEqual(1);
    // cartão sm: 168 de largura, 16:9, respiro de 6% em cada lado; a linha da referência sai da altura.
    const height = (168 * 9) / 16 - 2 * 168 * 0.06 - parseFloat(ref.style.fontSize) * 1.3;
    expect(lines * parseFloat(p.style.fontSize) * 1.25).toBeLessThanOrEqual(height);
  });

  it("o texto diminui em três degraus conforme o comprimento", () => {
    const sizeOf = (n: number) => {
      const { unmount } = render(<SlidePreview slide={{ kind: "POINT", text: "a".repeat(n), reference: null }} style="MINIMAL" size="lg" />);
      const v = screen.getByText("a".repeat(n)).style.fontSize;
      unmount();
      return v;
    };
    const small = sizeOf(40), mid = sizeOf(120), long = sizeOf(250);
    expect(new Set([small, mid, long]).size).toBe(3);
  });
});
