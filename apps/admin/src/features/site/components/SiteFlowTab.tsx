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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import {
  fetchSiteLayout,
  fetchSiteSchema,
  fetchSiteSections,
  updateSiteLayout,
  type SiteHomeBlock,
} from "@/features/site/api/tenant-site-content-api";
import { getApiErrorMessage } from "@/lib/api";
import {
  FIXED_BOTTOM,
  FIXED_TOP,
  HOME_BLOCKS,
  OTHER_PAGES,
  type ChurchTab,
  type FlowBlock,
} from "./site-flow-blocks";
import { SiteFlowRow, SortableFlowRow } from "./SiteFlowRow";
import { SiteSectionSheet } from "./SiteSectionSheet";

interface SiteFlowTabProps {
  /** Avisa a página quando há ordem por salvar, para o aviso ao trocar de aba. */
  onDirtyChange: (dirty: boolean) => void;
  onGoToTab: (tab: ChurchTab) => void;
}

function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Aba Site de Igreja: a página inicial como uma linha, na ordem em que o site
 * a renderiza, com o miolo reordenável e as outras páginas abaixo.
 */
export function SiteFlowTab({ onDirtyChange, onGoToTab }: SiteFlowTabProps) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("SITE", "EDIT");
  const [draft, setDraft] = useState<SiteHomeBlock[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const schemaQuery = useQuery({
    queryKey: ["site-schema"],
    queryFn: fetchSiteSchema,
    staleTime: 5 * 60_000,
  });
  const sectionsQuery = useQuery({ queryKey: ["site-sections"], queryFn: fetchSiteSections });
  const layoutQuery = useQuery({ queryKey: ["site-layout"], queryFn: fetchSiteLayout });

  const saved = layoutQuery.data?.home;
  const order = draft ?? saved ?? [];
  const dirty = draft !== null && saved !== undefined && !sameOrder(draft, saved);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: updateSiteLayout,
    onSuccess: (layout) => {
      queryClient.setQueryData(["site-layout"], layout);
      setDraft(null);
      toast.success("Ordem salva. O site é atualizado em instantes.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setDraft(arrayMove(order, from, to));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    moveTo(order.indexOf(active.id as SiteHomeBlock), order.indexOf(over.id as SiteHomeBlock));
  };

  if (sectionsQuery.isPending || layoutQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (sectionsQuery.isError || layoutQuery.isError) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Não foi possível carregar o conteúdo do site.
      </p>
    );
  }

  const sections = sectionsQuery.data;
  const sectionFor = (block: FlowBlock) =>
    block.sectionKey ? sections.find((s) => s.key === block.sectionKey) : undefined;
  const openSection = sections.find((s) => s.key === openKey) ?? null;
  const openSpec = schemaQuery.data?.sections.find((s) => s.key === openKey);
  const openBlock = [FIXED_BOTTOM, ...Object.values(HOME_BLOCKS), ...OTHER_PAGES].find(
    (block) => block.sectionKey === openKey,
  );

  const rowProps = { canEdit, onEdit: setOpenKey, onGoToTab };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Página inicial</h2>
            <p className="text-sm text-muted-foreground">
              Ordem em que as seções aparecem no site.
              {canEdit && " Arraste pela alça ou use as setas."}
            </p>
          </div>
          {dirty && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ordem alterada</span>
              <Button
                variant="outline"
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => setDraft(null)}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate(order)}
              >
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar ordem
              </Button>
            </div>
          )}
        </div>

        <ol aria-label="Página inicial" className="relative ml-1.5 space-y-2 border-l-2 pl-4 sm:ml-3 sm:pl-6">
          <li data-block={FIXED_TOP.id}>
            <SiteFlowRow block={FIXED_TOP} locked timeline {...rowProps} />
          </li>

          {canEdit ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                {order.map((id, index) => (
                  <SortableFlowRow
                    key={id}
                    block={HOME_BLOCKS[id]}
                    section={sectionFor(HOME_BLOCKS[id])}
                    timeline
                    move={{
                      index,
                      total: order.length,
                      onMove: (direction) => moveTo(index, index + direction),
                    }}
                    {...rowProps}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            order.map((id) => (
              <li key={id} data-block={id}>
                <SiteFlowRow
                  block={HOME_BLOCKS[id]}
                  section={sectionFor(HOME_BLOCKS[id])}
                  timeline
                  {...rowProps}
                />
              </li>
            ))
          )}

          <li data-block={FIXED_BOTTOM.id}>
            <SiteFlowRow
              block={FIXED_BOTTOM}
              section={sectionFor(FIXED_BOTTOM)}
              locked
              timeline
              {...rowProps}
            />
          </li>
        </ol>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Outras páginas</h2>
          <p className="text-sm text-muted-foreground">Conteúdo que fica fora da página inicial.</p>
        </div>
        <ul aria-label="Outras páginas" className="space-y-2">
          {OTHER_PAGES.map((block) => (
            <li key={block.id} data-block={block.id}>
              <SiteFlowRow block={block} section={sectionFor(block)} {...rowProps} />
            </li>
          ))}
        </ul>
      </section>

      <SiteSectionSheet
        section={openSection}
        spec={openSpec}
        icons={schemaQuery.data?.icons ?? []}
        canEdit={canEdit}
        source={
          openBlock?.source?.tab ? { ...openBlock.source, tab: openBlock.source.tab } : undefined
        }
        onGoToSource={(tab) => {
          setOpenKey(null);
          onGoToTab(tab);
        }}
        onOpenChange={(open) => {
          if (!open) setOpenKey(null);
        }}
      />
    </div>
  );
}
