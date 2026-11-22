import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { deriveSong } from "../../lib/document";
import { SlidesPreview } from "./SlidesPreview";

describe("SlidesPreview", () => {
  it("avisa quando o slide ultrapassa linhas ou caracteres e oferece ajuste explícito", () => {
    const onReflow = vi.fn();
    const slides = deriveSong([
      { id: "a", type: "lyric", text: "Uma linha muito comprida", part: { kind: "VERSE", mood: "WORSHIP" } },
      { id: "b", type: "lyric", text: "Linha dois" },
      { id: "c", type: "lyric", text: "Linha três" },
    ]).slides;
    render(<SlidesPreview slides={slides} selected={0} maxChars={12} maxLines={2} canEdit onReflow={onReflow} />);

    expect(screen.getByRole("status")).toHaveTextContent("3 linhas");
    expect(screen.getByRole("button", { name: "Ajustar quebra" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ajustar quebra" }));
    expect(onReflow).toHaveBeenCalledWith("a");
  });

  it("não mostra aviso nem ajuste quando o slide está dentro do padrão", () => {
    const slides = deriveSong([
      { id: "a", type: "lyric", text: "Linha curta", part: { kind: "VERSE", mood: "WORSHIP" } },
    ]).slides;
    render(<SlidesPreview slides={slides} selected={0} maxChars={28} maxLines={3} canEdit onReflow={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustar quebra" })).not.toBeInTheDocument();
  });
});
