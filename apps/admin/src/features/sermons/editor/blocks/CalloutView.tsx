import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Lock } from "lucide-react";
import { BLOCK_COLORS, BLOCK_LABELS, type CalloutKind } from "../block-colors";

/** Ilustração (verde), Aplicação (laranja) e "Só para mim" (cinza, com cadeado): o mesmo bloco com variação. */
export function CalloutView({ node }: NodeViewProps) {
  const kind = node.type.name as CalloutKind;
  const colors = BLOCK_COLORS[kind];
  const isPrivate = kind === "privateNote";

  return (
    <NodeViewWrapper
      data-type={kind}
      className={`my-1 rounded-xl px-[18px] py-3.5 ${isPrivate ? "flex items-start gap-2.5 text-[15px] text-[#374151]" : "flex flex-col gap-1 text-base"}`}
      style={{ backgroundColor: colors.background }}
    >
      {isPrivate ? (
        <span contentEditable={false} className="mt-[5px] flex-none select-none" style={{ color: colors.accent }}>
          <Lock aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} />
          <span className="sr-only">{BLOCK_LABELS[kind]}</span>
        </span>
      ) : (
        <span
          contentEditable={false}
          className="select-none text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: colors.accent }}
        >
          {BLOCK_LABELS[kind]}
        </span>
      )}
      <NodeViewContent as="div" className="sermon-callout-content min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}
