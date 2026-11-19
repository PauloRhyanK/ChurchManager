import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import type { VerseAttrs } from "../../lib/document";
import { BLOCK_COLORS } from "../block-colors";
import { VerseDialog } from "../VerseDialog";

/** Versículo: caixa roxa clara com o texto e a referência em negrito abaixo. Clicar abre o diálogo para alterar ou remover. */
export function VerseView({ node, editor, selected, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as VerseAttrs;
  const [open, setOpen] = useState(false);
  const text = attrs.verses.map((v) => v.text).join(" ");
  // Com mais de um versículo, cada um começa com o número em sobrescrito (só na tela).
  const numbered = attrs.verses.length > 1;
  const colors = BLOCK_COLORS.verse;

  function openDialog() {
    if (editor.isEditable) setOpen(true);
  }

  return (
    <NodeViewWrapper data-type="verse" className="my-1">
      <figure
        role={editor.isEditable ? "button" : undefined}
        tabIndex={editor.isEditable ? 0 : undefined}
        aria-label={editor.isEditable ? `Alterar versículo ${attrs.reference}` : undefined}
        onClick={openDialog}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDialog();
          }
        }}
        className={`m-0 flex flex-col gap-2 rounded-xl px-[22px] py-[18px] ${editor.isEditable ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-[#6D54CF]" : ""}`}
        style={{ backgroundColor: colors.background }}
      >
        <blockquote className="m-0 text-[19px] leading-normal text-[#030712]">
          {numbered
            ? attrs.verses.map((v, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  <sup className="text-[11px] font-medium text-muted-foreground">{v.number}</sup> {v.text}
                </span>
              ))
            : text}
        </blockquote>
        <figcaption className="text-sm font-bold" style={{ color: colors.accent }}>
          {attrs.reference}
        </figcaption>
      </figure>
      {open && (
        <VerseDialog
          open={open}
          onOpenChange={setOpen}
          initial={attrs}
          onSubmit={(verse) => editor.commands.updateVerse(attrs.id, verse)}
          onRemove={deleteNode}
          restoreFocus={() => !editor.isDestroyed && editor.commands.focus()}
        />
      )}
    </NodeViewWrapper>
  );
}
