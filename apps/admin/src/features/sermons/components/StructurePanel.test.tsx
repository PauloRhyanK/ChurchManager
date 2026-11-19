import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_DERIVED } from "../lib/sermon-example";
import { StructurePanel } from "./StructurePanel";

describe("StructurePanel", () => {
  it("mostra seções, minutos e versículos do exemplo", () => {
    render(<StructurePanel derived={EXAMPLE_DERIVED} activeId={null} onSelect={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Estrutura do sermão" });
    expect(nav).toHaveTextContent("Estrutura");
    for (const s of EXAMPLE_DERIVED.sections) {
      const label = s.number ? `${s.number}. ${s.title}` : s.title;
      expect(screen.getByRole("button", { name: new RegExp(label) })).toHaveTextContent(`${s.minutes} min`);
    }
    expect(nav).toHaveTextContent(`Versículos · ${EXAMPLE_DERIVED.verses.length}`);
    for (const v of EXAMPLE_DERIVED.verses) expect(nav).toHaveTextContent(v.reference);
  });

  it("vazio mostra o texto de vazio", () => {
    render(
      <StructurePanel
        derived={{ ...EXAMPLE_DERIVED, sections: [], verses: [] }}
        activeId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("A estrutura aparece conforme você escreve.")).toBeInTheDocument();
  });

  it("clicar chama onSelect com o id e destaca a seção ativa", () => {
    const onSelect = vi.fn();
    const target = EXAMPLE_DERIVED.sections.find((s) => s.id !== null)!;
    render(<StructurePanel derived={EXAMPLE_DERIVED} activeId={target.id} onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: new RegExp(target.title) });
    expect(button).toHaveAttribute("aria-current", "true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(target.id);
  });
});
