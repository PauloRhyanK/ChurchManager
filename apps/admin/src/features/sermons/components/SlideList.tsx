import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { EDITABLE_KINDS, subtitleLimit, textLimit } from "../lib/slide-edits";
import { slideFace, type SlideItem, type SlideKind } from "../lib/slides";

const KIND_LABEL: Record<SlideKind, string> = {
  TITLE: "Título",
  VERSE: "Versículo",
  POINT: "Ponto",
  SUMMARY: "Resumo",
  PRIVATE: "Só você",
};

const PRIVATE_HINT = "Anotação só para você. Não vai para o telão.";

interface SlideListProps {
  items: SlideItem[];
  readOnly?: boolean;
  onToggle(id: string, included: boolean): void;
  /** Arrastou `fromId` para o lugar de `toId`. */
  onMove(fromId: string, toId: string): void;
  onEdit(id: string, text: string): void;
  /** Novo subtítulo de um ponto ou versículo; "" tira. */
  onSubtitle(id: string, subtitle: string): void;
}

/** Texto clicável que abre a edição no lugar (Enter confirma, Esc cancela). `emptyHint`: vazio não vale e avisa. */
function EditableText({
  value,
  placeholder,
  label,
  maxLength,
  emptyHint,
  className,
  onEdit,
}: {
  value: string;
  /** Texto do botão quando `value` está vazio. */
  placeholder?: string;
  label: string;
  maxLength: number;
  emptyHint?: string;
  className: string;
  onEdit(text: string): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const cancelled = useRef(false);

  if (draft === null) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            cancelled.current = false;
            setShowHint(false);
            setDraft(value);
          }}
          className={cn("min-w-0 truncate rounded px-1 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          {value || placeholder}
        </button>
        {showHint && emptyHint && (
          <span role="status" className="flex-none text-xs text-destructive">
            {emptyHint}
          </span>
        )}
      </span>
    );
  }
  const commit = () => {
    if (cancelled.current) return;
    cancelled.current = true;
    const text = draft.trim();
    setDraft(null);
    // Vazio não vale quando há dica: o texto antigo fica e a dica aparece ao lado.
    if (!text && emptyHint) setShowHint(true);
    else if (text !== value) onEdit(text);
  };
  return (
    <input
      aria-label={label}
      autoFocus
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          setDraft(null);
        }
      }}
      className={cn("min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring", className)}
    />
  );
}

/** Subtítulo de ponto ou versículo: "Adicionar subtítulo" ou o subtítulo, editável no lugar (vazio tira). */
function SubtitleLine({ item, editable, onSubtitle }: { item: SlideItem; editable: boolean; onSubtitle(text: string): void }) {
  const limit = subtitleLimit(item);
  if (editable && limit !== null) {
    return (
      <EditableText
        value={item.subtitle ?? ""}
        placeholder="Adicionar subtítulo"
        label="Subtítulo do slide"
        maxLength={limit}
        className={cn("text-[13px]", item.subtitle ? "text-muted-foreground" : "font-medium text-primary")}
        onEdit={onSubtitle}
      />
    );
  }
  return item.subtitle ? <span className="min-w-0 truncate px-1 text-[13px] text-muted-foreground">{item.subtitle}</span> : null;
}

function ItemText({ item, editable, onEdit }: { item: SlideItem; editable: boolean; onEdit(text: string): void }) {
  if (item.kind === "VERSE") {
    return (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="flex-none text-[15px] font-semibold">{item.reference}</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{item.text}</span>
      </span>
    );
  }
  if (editable && EDITABLE_KINDS.includes(item.kind)) {
    return (
      <EditableText
        value={item.text}
        label="Texto do slide"
        maxLength={textLimit(item)}
        emptyHint="O texto não pode ficar vazio."
        className="text-[15px] font-semibold"
        onEdit={onEdit}
      />
    );
  }
  return (
    <span className={cn("min-w-0 truncate px-1 text-[15px] font-semibold", item.kind === "PRIVATE" && "text-muted-foreground")}>
      {item.text}
    </span>
  );
}

function RowBody({ item, readOnly, onToggle, onEdit, onSubtitle }: { item: SlideItem; readOnly: boolean } & Pick<SlideListProps, "onToggle" | "onEdit" | "onSubtitle">) {
  const isPrivate = item.kind === "PRIVATE";
  return (
    <>
      <Checkbox
        aria-label={`Mostrar no telão: ${item.kind === "VERSE" ? item.reference : item.text}`}
        checked={!isPrivate && item.included}
        disabled={readOnly || isPrivate}
        onCheckedChange={(v) => onToggle(item.id, v === true)}
        className="h-5 w-5 flex-none"
      />
      <span
        className={cn(
          "flex min-w-[76px] flex-none items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em]",
          item.kind === "VERSE" ? "text-primary" : "text-muted-foreground",
        )}
      >
        {isPrivate && <Lock className="h-3 w-3" aria-hidden="true" />}
        {KIND_LABEL[item.kind]}
        {item.kind === "SUMMARY" && !item.edited && (
          <span className="rounded bg-primary/10 px-1 text-[10px] font-bold normal-case tracking-normal text-primary" title="Resumo escrito por IA">
            IA
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <ItemText item={item} editable={!readOnly} onEdit={(text) => onEdit(item.id, text)} />
        {(item.kind === "POINT" || item.kind === "VERSE") && (
          <SubtitleLine item={item} editable={!readOnly} onSubtitle={(text) => onSubtitle(item.id, text)} />
        )}
      </span>
      {!isPrivate && (
        <span className="flex-none rounded border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          Modelo {slideFace(item).layout.slice(1)}
        </span>
      )}
    </>
  );
}

function SortableRow({ id, first, muted, children }: { id: string; first: boolean; muted: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-h-[60px] items-center gap-3 bg-card py-2 pl-2 pr-5",
        !first && "border-t",
        muted && "bg-muted/40",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button
        type="button"
        aria-label="Arrastar para mudar a ordem"
        className="flex h-9 w-7 flex-none cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {children}
    </li>
  );
}

/** Lista da conferência: marcar, reordenar (arrastando pela alça), editar título, pontos e subtítulos. Privados no fim, parados. */
export function SlideList({ items, readOnly = false, onToggle, onMove, onEdit, onSubtitle }: SlideListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const movable = items.filter((i) => i.kind !== "PRIVATE");
  const privates = items.filter((i) => i.kind === "PRIVATE");

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  }

  const staticRow = (item: SlideItem, first: boolean) => (
    <li
      key={item.id}
      title={item.kind === "PRIVATE" ? PRIVATE_HINT : undefined}
      className={cn(
        "flex min-h-[60px] items-center gap-3 py-2 pr-5",
        readOnly ? "pl-5" : "pl-11",
        !first && "border-t",
        item.kind === "PRIVATE" ? "bg-muted/60" : "bg-card",
      )}
    >
      <RowBody item={item} readOnly={readOnly} onToggle={onToggle} onEdit={onEdit} onSubtitle={onSubtitle} />
    </li>
  );

  return (
    <ul>
      {readOnly ? (
        movable.map((item, i) => staticRow(item, i === 0))
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={movable.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {movable.map((item, i) => (
              <SortableRow key={item.id} id={item.id} first={i === 0} muted={!item.included}>
                <RowBody item={item} readOnly={readOnly} onToggle={onToggle} onEdit={onEdit} onSubtitle={onSubtitle} />
              </SortableRow>
            ))}
          </SortableContext>
        </DndContext>
      )}
      {privates.map((item, i) => staticRow(item, movable.length === 0 && i === 0))}
    </ul>
  );
}
