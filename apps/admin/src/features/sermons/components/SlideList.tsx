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
import { EDITABLE_KINDS } from "../lib/slide-edits";
import { SLIDE_LIMITS, type SlideItem, type SlideKind } from "../lib/slides";

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
}

/** Texto do título, ponto ou resumo: clicar abre a edição no lugar (Enter confirma, Esc cancela). */
function EditableText({ item, onEdit }: { item: SlideItem; onEdit(text: string): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [emptyHint, setEmptyHint] = useState(false);
  const cancelled = useRef(false);

  if (draft === null) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            cancelled.current = false;
            setEmptyHint(false);
            setDraft(item.text);
          }}
          className="min-w-0 truncate rounded px-1 py-1 text-left text-[15px] font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.text}
        </button>
        {emptyHint && (
          <span role="status" className="flex-none text-xs text-destructive">
            O texto não pode ficar vazio.
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
    // Vazio não vale: o texto antigo fica e a dica aparece ao lado.
    if (!text) setEmptyHint(true);
    else if (text !== item.text) onEdit(text);
  };
  return (
    <input
      aria-label="Texto do slide"
      autoFocus
      value={draft}
      maxLength={SLIDE_LIMITS.textChars}
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
      className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function ItemText({ item, editable, onEdit }: { item: SlideItem; editable: boolean; onEdit(text: string): void }) {
  if (item.kind === "VERSE") {
    return (
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="flex-none text-[15px] font-semibold">{item.reference}</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{item.text}</span>
      </span>
    );
  }
  if (editable && EDITABLE_KINDS.includes(item.kind)) return <EditableText item={item} onEdit={onEdit} />;
  return (
    <span className={cn("min-w-0 flex-1 truncate px-1 text-[15px] font-semibold", item.kind === "PRIVATE" && "text-muted-foreground")}>
      {item.text}
    </span>
  );
}

function RowBody({ item, readOnly, onToggle, onEdit }: { item: SlideItem; readOnly: boolean } & Pick<SlideListProps, "onToggle" | "onEdit">) {
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
      <ItemText item={item} editable={!readOnly} onEdit={(text) => onEdit(item.id, text)} />
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

/** Lista da conferência: marcar, reordenar (arrastando pela alça) e editar título e pontos. Privados no fim, parados. */
export function SlideList({ items, readOnly = false, onToggle, onMove, onEdit }: SlideListProps) {
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
      <RowBody item={item} readOnly={readOnly} onToggle={onToggle} onEdit={onEdit} />
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
                <RowBody item={item} readOnly={readOnly} onToggle={onToggle} onEdit={onEdit} />
              </SortableRow>
            ))}
          </SortableContext>
        </DndContext>
      )}
      {privates.map((item, i) => staticRow(item, movable.length === 0 && i === 0))}
    </ul>
  );
}
