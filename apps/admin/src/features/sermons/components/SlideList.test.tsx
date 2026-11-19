import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SlideItem } from "../lib/slides";
import { SlideList } from "./SlideList";

const ITEMS: SlideItem[] = [
  { id: "title", kind: "TITLE", sourceBlockId: null, text: "Luz que não se apaga", reference: null, included: true, edited: false },
  { id: "v1:0", kind: "VERSE", sourceBlockId: "v1", text: "Eu sou a luz do mundo", reference: "João 8:12", included: true, edited: false },
  { id: "p1:0", kind: "POINT", sourceBlockId: "p1", text: "A luz chama", reference: null, included: false, edited: false },
  { id: "n1:0", kind: "PRIVATE", sourceBlockId: "n1", text: "História da lanterna", reference: null, included: false, edited: false },
];

function renderList(readOnly = false, items: SlideItem[] = ITEMS) {
  const handlers = { onToggle: vi.fn(), onMove: vi.fn(), onEdit: vi.fn() };
  render(<SlideList items={items} readOnly={readOnly} {...handlers} />);
  return handlers;
}

const row = (text: string | RegExp) => screen.getByText(text).closest("li") as HTMLElement;

describe("SlideList", () => {
  it("mostra tipo, texto e a referência do versículo", () => {
    renderList();
    expect(within(row("Luz que não se apaga")).getByText("Título")).toBeInTheDocument();
    expect(within(row("João 8:12")).getByText("Versículo")).toBeInTheDocument();
    expect(within(row("João 8:12")).getByText("Eu sou a luz do mundo")).toBeInTheDocument();
    expect(within(row("A luz chama")).getByText("Ponto")).toBeInTheDocument();
    expect(within(row("História da lanterna")).getByText("Só você")).toBeInTheDocument();
  });

  it("marcar e desmarcar avisa com o id", () => {
    const { onToggle } = renderList();
    fireEvent.click(within(row("João 8:12")).getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("v1:0", false);
    fireEvent.click(within(row("A luz chama")).getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("p1:0", true);
  });

  it("item privado: caixa desmarcada e desligada, sem alça, com a dica", () => {
    renderList();
    const li = row("História da lanterna");
    expect(li).toHaveAttribute("title", "Anotação só para você. Não vai para o telão.");
    const box = within(li).getByRole("checkbox");
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(within(li).queryByLabelText("Arrastar para mudar a ordem")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Arrastar para mudar a ordem")).toHaveLength(3);
  });

  it("clicar no texto de um ponto edita no lugar: Enter confirma", () => {
    const { onEdit } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "A luz chama" }));
    const input = screen.getByLabelText("Texto do slide");
    expect(input).toHaveAttribute("maxLength", "300");
    fireEvent.change(input, { target: { value: "A luz convida" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEdit).toHaveBeenCalledWith("p1:0", "A luz convida");
    expect(screen.queryByLabelText("Texto do slide")).not.toBeInTheDocument();
  });

  it("Esc cancela a edição", () => {
    const { onEdit } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Luz que não se apaga" }));
    const input = screen.getByLabelText("Texto do slide");
    fireEvent.change(input, { target: { value: "Outro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Luz que não se apaga")).toBeInTheDocument();
  });

  it("texto vazio mantém o texto antigo e avisa", () => {
    const { onEdit } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "A luz chama" }));
    const input = screen.getByLabelText("Texto do slide");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "A luz chama" })).toBeInTheDocument();
    expect(screen.getByText("O texto não pode ficar vazio.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "A luz chama" }));
    expect(screen.queryByText("O texto não pode ficar vazio.")).not.toBeInTheDocument();
  });

  it("versículo não abre edição", () => {
    renderList();
    expect(screen.queryByRole("button", { name: "Eu sou a luz do mundo" })).not.toBeInTheDocument();
  });

  it("somente leitura: sem alças, caixas desligadas e sem edição", () => {
    renderList(true);
    expect(screen.queryByLabelText("Arrastar para mudar a ordem")).not.toBeInTheDocument();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    expect(screen.queryByRole("button", { name: "A luz chama" })).not.toBeInTheDocument();
  });

  describe("resumos", () => {
    const SUMMARY: SlideItem = { id: "i1:0", kind: "SUMMARY", sourceBlockId: "i1", text: "A lanterna mostra o caminho", reference: null, included: true, edited: false };

    it("mostra o rótulo Resumo e o selo IA enquanto não foi editado", () => {
      renderList(false, [...ITEMS, SUMMARY]);
      const li = row("A lanterna mostra o caminho");
      expect(within(li).getByText("Resumo")).toBeInTheDocument();
      expect(within(li).getByText("IA")).toBeInTheDocument();
    });

    it("o selo IA some depois de editado", () => {
      renderList(false, [...ITEMS, { ...SUMMARY, edited: true }]);
      const li = row("A lanterna mostra o caminho");
      expect(within(li).getByText("Resumo")).toBeInTheDocument();
      expect(within(li).queryByText("IA")).not.toBeInTheDocument();
    });

    it("editar o resumo manda o texto novo (até 300)", () => {
      const { onEdit } = renderList(false, [...ITEMS, SUMMARY]);
      fireEvent.click(screen.getByRole("button", { name: "A lanterna mostra o caminho" }));
      const input = screen.getByLabelText("Texto do slide");
      expect(input).toHaveAttribute("maxLength", "300");
      fireEvent.change(input, { target: { value: "A lanterna guia" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onEdit).toHaveBeenCalledWith("i1:0", "A lanterna guia");
    });
  });
});
