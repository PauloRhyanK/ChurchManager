import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerseDialog } from "./VerseDialog";

function renderDialog(initial?: { reference: string; text: string }) {
  const onSubmit = vi.fn();
  const onRemove = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <VerseDialog open onOpenChange={onOpenChange} initial={initial} onSubmit={onSubmit} onRemove={initial ? onRemove : undefined} />,
  );
  return { onSubmit, onRemove, onOpenChange };
}

const reference = () => screen.getByRole("textbox", { name: "Referência" });
const text = () => screen.getByRole("textbox", { name: "Texto" });

describe("VerseDialog", () => {
  it("Inserir fica desligado sem referência ou sem texto", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Inserir versículo" })).toBeInTheDocument();
    expect(reference()).toHaveAttribute("placeholder", "João 3:16");
    expect(reference()).toHaveAttribute("maxLength", "120");
    const insert = screen.getByRole("button", { name: "Inserir" });
    expect(insert).toBeDisabled();
    fireEvent.change(reference(), { target: { value: "João 3:16" } });
    expect(insert).toBeDisabled();
    fireEvent.change(text(), { target: { value: "   " } });
    expect(insert).toBeDisabled();
    fireEvent.change(reference(), { target: { value: "  " } });
    fireEvent.change(text(), { target: { value: "Porque Deus amou o mundo" } });
    expect(insert).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("envia referência e texto aparados", () => {
    const { onSubmit, onOpenChange } = renderDialog();
    fireEvent.change(reference(), { target: { value: "  João 3:16 " } });
    fireEvent.change(text(), { target: { value: "\n Porque Deus amou o mundo.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Inserir" }));
    expect(onSubmit).toHaveBeenCalledWith({ reference: "João 3:16", text: "Porque Deus amou o mundo." });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("em modo de alteração mostra os valores e Remover", () => {
    const { onSubmit, onRemove } = renderDialog({ reference: "Salmos 23:1", text: "O Senhor é o meu pastor." });
    expect(reference()).toHaveValue("Salmos 23:1");
    expect(text()).toHaveValue("O Senhor é o meu pastor.");
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(onRemove).toHaveBeenCalled();
    fireEvent.change(text(), { target: { value: "O Senhor é o meu pastor; nada me faltará." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith({ reference: "Salmos 23:1", text: "O Senhor é o meu pastor; nada me faltará." });
  });
});
