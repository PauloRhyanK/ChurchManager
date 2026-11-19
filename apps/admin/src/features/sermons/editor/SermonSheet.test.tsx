import type { Editor } from "@tiptap/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_DOC } from "../lib/sermon-example";
import { SermonSheet } from "./SermonSheet";
import { SermonToolbar } from "./SermonToolbar";

// ProseMirror pede ao DOM medidas que o jsdom não tem.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
document.elementFromPoint ??= () => null;

function renderSheet(editable = true) {
  const onEditor = vi.fn<(editor: Editor) => void>();
  const onDocumentChange = vi.fn();
  const onTitleChange = vi.fn();
  render(
    <SermonSheet
      title="Luz que não se apaga"
      document={EXAMPLE_DOC}
      editable={editable}
      onTitleChange={onTitleChange}
      onDocumentChange={onDocumentChange}
      onEditor={onEditor}
    />,
  );
  return { onEditor, onDocumentChange, onTitleChange };
}

describe("SermonSheet", () => {
  it("desenha os blocos do documento, com os Pontos numerados", async () => {
    const { onEditor } = renderSheet();
    await waitFor(() => expect(onEditor).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Título da palavra" })).toHaveValue("Luz que não se apaga");
    expect(await screen.findByText("João 8:12")).toBeInTheDocument();
    expect(screen.getByText("Ilustração")).toBeInTheDocument();
    expect(screen.getByText("Aplicação")).toBeInTheDocument();
    const numbers = Array.from(document.querySelectorAll(".sermon-point > span")).map((s) => s.textContent);
    expect(numbers).toEqual(["1.", "2."]);
  });

  it("avisa a mudança do documento e a barra marca o bloco ativo", async () => {
    const { onEditor, onDocumentChange } = renderSheet();
    await waitFor(() => expect(onEditor).toHaveBeenCalled());
    const editor = onEditor.mock.calls[0][0];
    render(<SermonToolbar editor={editor} />);
    const point = screen.getByRole("button", { name: "Ponto" });
    expect(point).toHaveAttribute("aria-pressed", "false");
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size);
      editor.commands.insertPoint();
    });
    expect(onDocumentChange).toHaveBeenCalled();
    await waitFor(() => expect(point).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Versículo" }));
    expect(await screen.findByRole("heading", { name: "Inserir versículo" })).toBeInTheDocument();
  });

  it("só leitura: barra desligada e título sem edição", async () => {
    const { onEditor } = renderSheet(false);
    await waitFor(() => expect(onEditor).toHaveBeenCalled());
    render(<SermonToolbar editor={onEditor.mock.calls[0][0]} />);
    expect(screen.getByRole("button", { name: "Negrito" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Título da palavra" })).toHaveAttribute("readonly");
  });
});
