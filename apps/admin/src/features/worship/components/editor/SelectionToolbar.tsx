import { ChevronDown, MessageSquare, Repeat, SplitSquareVertical } from "lucide-react";
import { useState } from "react";
import { PART_KIND_LABEL, type PartKind } from "../../lib/document";

interface SelectionToolbarProps {
  /** Tipo da parte onde a seleção começa, para destacar o botão. */
  activeKind: PartKind | null;
  collapsed?: boolean;
  onKind: (kind: PartKind) => void;
  onCue: () => void;
  onRepeat: () => void;
  onSplit: () => void;
}

const MAIN: PartKind[] = ["VERSE", "CHORUS", "BRIDGE"];
const OTHER: PartKind[] = ["INTRO", "PRE_CHORUS", "INSTRUMENTAL", "ENDING"];

const ICON_BUTTON = "flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/15";

/** A barrinha que aparece ao selecionar um trecho da letra. */
export function SelectionToolbar({ activeKind, collapsed = false, onKind, onCue, onRepeat, onSplit }: SelectionToolbarProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  return (
    <div
      role="toolbar"
      aria-label={collapsed ? "Inserir ou classificar neste ponto" : "O que fazer com o trecho selecionado"}
      className="relative flex flex-wrap items-center gap-0.5 rounded-xl bg-gray-900 p-1 text-sm leading-tight shadow-xl"
    >
      {MAIN.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={activeKind === kind}
          onClick={() => onKind(kind)}
          className={
            activeKind === kind
              ? "min-h-11 rounded-lg bg-primary px-3 font-bold text-white"
              : "min-h-11 rounded-lg px-3 text-white hover:bg-white/15"
          }
        >
          {PART_KIND_LABEL[kind]}
        </button>
      ))}
      <button
        type="button"
        aria-label="Outra parte"
        aria-expanded={otherOpen}
        title="Outra parte"
        onClick={() => setOtherOpen((v) => !v)}
        className={`${ICON_BUTTON} ${activeKind && OTHER.includes(activeKind) ? "bg-primary" : ""}`}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {otherOpen && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 flex min-w-44 flex-col rounded-xl bg-gray-900 p-1 shadow-xl">
          {OTHER.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOtherOpen(false);
                onKind(kind);
              }}
              className={`min-h-11 rounded-lg px-3 text-left text-white hover:bg-white/15 ${activeKind === kind ? "font-bold" : ""}`}
            >
              {PART_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      )}
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-gray-600" />
      <button type="button" aria-label="Instrução para a banda" title="Instrução para a banda" onClick={onCue} className={`${ICON_BUTTON} text-amber-300`}>
        <MessageSquare className="h-[18px] w-[18px]" />
      </button>
      {!collapsed && <button type="button" aria-label="Repete" title="Repete: duplica o trecho logo abaixo" onClick={onRepeat} className={ICON_BUTTON}>
        <Repeat className="h-[18px] w-[18px]" />
      </button>}
      {!collapsed && <button type="button" aria-label="Dividir slide" title="Dividir slide: o slide passa a começar nesta linha" onClick={onSplit} className={ICON_BUTTON}>
        <SplitSquareVertical className="h-[18px] w-[18px]" />
      </button>}
    </div>
  );
}
