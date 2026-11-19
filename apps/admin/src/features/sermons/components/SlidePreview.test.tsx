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
