import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

interface SortableListProps<T extends { key: string }> {
  items: T[];
  disabled?: boolean;
  onReorder: (items: T[]) => void;
  /** O nome do item, para o rótulo da alça de arrastar. */
  labelOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Classes a mais na linha (ex.: a faixa roxa da música). */
  rowClassName?: (item: T) => string;
}

function Row({
  id,
  label,
  disabled,
  first,
  className = "",
  children,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  first: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 bg-card px-3 py-2.5 ${first ? "" : "border-t"} ${isDragging ? "relative z-10 shadow-lg" : ""} ${className}`}
    >
      {!disabled && (
        <button
          type="button"
          aria-label={`Arrastar ${label}`}
          className="flex h-9 w-7 flex-none cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </li>
  );
}

/** Lista reordenável por arraste (mouse, toque ou teclado). */
export function SortableList<T extends { key: string }>({ items, disabled, onReorder, labelOf, renderItem, rowClassName }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <ul className="overflow-hidden rounded-xl border">
          {items.map((item, index) => (
            <Row key={item.key} id={item.key} label={labelOf(item)} disabled={disabled} first={index === 0} className={rowClassName?.(item)}>
              {renderItem(item, index)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
