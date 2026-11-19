import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react";

/** Ponto do sermão: o número ("1.", "2.") é desenhado aqui, contando os Pontos anteriores; não é texto do documento. */
export function PointView({ editor, getPos }: NodeViewProps) {
  const number = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const pos = getPos();
      if (pos === undefined) return null;
      let n = 0;
      e.state.doc.forEach((node, offset) => {
        if (offset <= pos && node.type.name === "point") n++;
      });
      return n;
    },
  });

  return (
    <NodeViewWrapper className="sermon-point flex pt-4 gap-2 text-[22px] font-bold leading-snug text-[#030712]">
      <span contentEditable={false} aria-hidden="true" className="select-none tabular-nums">
        {number ?? ""}.
      </span>
      <NodeViewContent as="div" className="min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}
