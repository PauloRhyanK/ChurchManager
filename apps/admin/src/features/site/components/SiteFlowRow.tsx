import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, ChevronDown, ChevronUp, GripVertical, Lock, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SiteSectionDto } from "@/features/site/api/tenant-site-content-api";
import { cn } from "@/lib/utils";
import { formatUpdatedAt, summarize, type ChurchTab, type FlowBlock } from "./site-flow-blocks";
import { SiteSourcePreview } from "./SiteSourcePreview";

export interface FlowRowMove {
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
}

interface SiteFlowRowProps {
  block: FlowBlock;
  section?: SiteSectionDto;
  canEdit: boolean;
  /** Bloco travado (topo/rodapé): mostra cadeado no lugar da alça. */
  locked?: boolean;
  /** Presente quando o bloco é reordenável e a pessoa pode editar. */
  move?: FlowRowMove;
  /** Alça de arrastar, vinda do `SortableFlowRow`. */
  handle?: ReactNode;
  /** Marca a bolinha na linha do tempo (só na página inicial). */
  timeline?: boolean;
  onEdit: (sectionKey: string) => void;
  onGoToTab: (tab: ChurchTab) => void;
}

const SOURCE_PILL = "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary";

export function SiteFlowRow({
  block,
  section,
  canEdit,
  locked,
  move,
  handle,
  timeline,
  onEdit,
  onGoToTab,
}: SiteFlowRowProps) {
  const Icon = block.icon;
  const source = block.source;
  const external = !block.sectionKey && source;
  const summary = block.note ?? (section ? summarize(section) : "");

  let pill: ReactNode;
  if (block.badge) {
    pill = (
      <Badge variant="outline" className="font-normal">
        {block.badge}
      </Badge>
    );
  } else if (external) {
    pill = <span className={SOURCE_PILL}>Vem de {source.label}</span>;
  } else if (source?.tab) {
    const tab = source.tab;
    pill = (
      <button
        type="button"
        className={cn(SOURCE_PILL, "inline-flex items-center gap-1 hover:bg-primary/15")}
        onClick={() => onGoToTab(tab)}
      >
        Usa {source.label}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </button>
    );
  } else if (section) {
    pill = (
      <Badge variant="secondary" className="font-normal">
        {formatUpdatedAt(section.updatedAt)}
      </Badge>
    );
  }

  let action: ReactNode = null;
  if (block.sectionKey) {
    const key = block.sectionKey;
    action = (
      <Button variant="outline" size="sm" onClick={() => onEdit(key)}>
        <Pencil className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" />
        <span className="hidden sm:inline">{canEdit ? "Editar" : "Ver"}</span>
        <span className="sr-only sm:hidden">{canEdit ? "Editar" : "Ver"}</span>
      </Button>
    );
  } else if (source?.tab) {
    const tab = source.tab;
    const label = `Ir para ${source.label}`;
    action = (
      <Button variant="outline" size="sm" aria-label={label} onClick={() => onGoToTab(tab)}>
        <span className="hidden sm:inline">{label}</span>
        <ArrowRight className="h-3.5 w-3.5 sm:ml-1.5" aria-hidden="true" />
      </Button>
    );
  } else if (source?.href) {
    const label = `Abrir ${source.label}`;
    action = (
      <Button variant="outline" size="sm" asChild>
        <Link to={source.href} aria-label={label}>
          <span className="hidden sm:inline">{label}</span>
          <ArrowRight className="h-3.5 w-3.5 sm:ml-1.5" aria-hidden="true" />
        </Link>
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-lg border px-3 py-2.5",
        locked ? "bg-muted/40" : "bg-card",
      )}
    >
      {timeline && (
        <span
          aria-hidden="true"
          className="absolute -left-[31px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-muted-foreground/40 bg-background"
        />
      )}

      {locked ? (
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Posição fixa" />
      ) : (
        handle
      )}
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{block.title}</span>
          {pill}
        </div>
        {summary && <p className="truncate text-sm text-muted-foreground">{summary}</p>}
        {block.preview && <SiteSourcePreview kind={block.preview} />}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {move && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Mover ${block.title} para cima`}
              disabled={move.index === 0}
              onClick={() => move.onMove(-1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Mover ${block.title} para baixo`}
              disabled={move.index === move.total - 1}
              onClick={() => move.onMove(1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </>
        )}
        {action}
      </div>
    </div>
  );
}

/** Linha reordenável: liga a alça e a posição ao dnd-kit. */
export function SortableFlowRow(props: Omit<SiteFlowRowProps, "handle" | "locked">) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.block.id });

  return (
    <li
      ref={setNodeRef}
      data-block={props.block.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-80 shadow-lg")}
    >
      <SiteFlowRow
        {...props}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="shrink-0 cursor-grab touch-none rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            aria-label={`Arrastar ${props.block.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </li>
  );
}
