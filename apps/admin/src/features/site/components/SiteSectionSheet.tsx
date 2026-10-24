import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, MoreHorizontal, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DiscardChangesDialog } from "@/features/church/components/DiscardChangesDialog";
import {
  resetSiteSection,
  updateSiteSection,
  type SiteFieldSpec,
  type SiteSectionDto,
  type SiteSectionSpec,
  type SiteSectionValue,
} from "@/features/site/api/tenant-site-content-api";
import { getApiErrorMessage } from "@/lib/api";
import type { ChurchTab, FlowSource } from "./site-flow-blocks";
import { SiteFieldInput } from "./SiteFieldInput";

/** Partes do título que ficam lado a lado, com rótulos curtos. */
const TITLE_PARTS: Record<string, string> = {
  titlePart1: "Início",
  titleHighlight: "Destaque",
  titlePart2: "Fim",
};

interface SiteSectionSheetProps {
  section: SiteSectionDto | null;
  spec: SiteSectionSpec | undefined;
  icons: string[];
  canEdit: boolean;
  /** Aba de onde vêm os dados que a seção puxa (seções mistas). */
  source?: FlowSource & { tab: ChurchTab };
  onGoToSource?: (tab: ChurchTab) => void;
  onOpenChange: (open: boolean) => void;
}

export function SiteSectionSheet({
  section,
  spec,
  icons,
  canEdit,
  source,
  onGoToSource,
  onOpenChange,
}: SiteSectionSheetProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SiteSectionValue>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Reinicializa o rascunho só ao abrir outra seção. Um refetch da mesma
  // seção (novo objeto, mesma chave) não pode descartar o que está sendo digitado.
  const sectionKey = section?.key ?? null;
  useEffect(() => {
    setDraft(section ? { ...section.value } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  const dirty = section !== null && JSON.stringify(draft) !== JSON.stringify(section.value);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["site-sections"] });

  const saveMutation = useMutation({
    mutationFn: () => updateSiteSection(section!.key, draft),
    onSuccess: () => {
      void invalidate();
      toast.success("Conteúdo atualizado.");
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetSiteSection(section!.key),
    onSuccess: (restored) => {
      setDraft({ ...restored.value });
      setConfirmReset(false);
      void invalidate();
      toast.success("Conteúdo restaurado.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const busy = saveMutation.isPending || resetMutation.isPending;

  const goToSource = () => {
    if (!source || !onGoToSource) return;
    if (dirty) {
      setConfirmLeave(true);
      return;
    }
    onGoToSource(source.tab);
  };

  const renderField = (field: SiteFieldSpec, label = field.label) => (
    <SiteFieldInput
      key={field.name}
      spec={{ ...field, label }}
      value={draft[field.name]}
      onChange={(next) => setDraft((prev) => ({ ...prev, [field.name]: next }))}
      icons={icons}
      disabled={!canEdit || busy}
    />
  );

  // As três partes do título viram uma linha só; o resto segue a ordem do registry.
  const fields: ReactNode[] = [];
  const titleFields = spec?.fields.filter((field) => field.name in TITLE_PARTS) ?? [];
  for (const field of spec?.fields ?? []) {
    if (!(field.name in TITLE_PARTS)) {
      fields.push(renderField(field));
    } else if (field === titleFields[0]) {
      fields.push(
        <fieldset key="title-parts" className="space-y-2">
          <legend className="text-sm font-medium">Título</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {titleFields.map((part) => renderField(part, TITLE_PARTS[part.name]))}
          </div>
        </fieldset>,
      );
    }
  }

  return (
    <>
      <Sheet open={section !== null} onOpenChange={onOpenChange}>
        <SheetContent
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
          // Sem isto o foco inicial cai no ícone de ajuda do 1.º campo e abre o tooltip.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{section?.title}</SheetTitle>
            <SheetDescription className="sr-only">{section?.description}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {source?.hint && onGoToSource && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <span>{source.hint}</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  onClick={goToSource}
                >
                  Abrir {source.label}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            )}
            {fields}
          </div>

          <SheetFooter className="flex-row items-center justify-between gap-3 border-t px-6 py-3 sm:justify-between">
            {canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Mais ações" disabled={busy}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restaurar original
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                {canEdit ? "Cancelar" : "Fechar"}
              </Button>
              {canEdit && (
                <Button type="button" disabled={busy} onClick={() => saveMutation.mutate()}>
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Salvar
                </Button>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar conteúdo original?</AlertDialogTitle>
            <AlertDialogDescription>
              As alterações em "{section?.title}" serão descartadas e a seção
              volta ao texto original. As outras seções não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={resetMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                resetMutation.mutate();
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DiscardChangesDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        onDiscard={() => {
          setConfirmLeave(false);
          if (source) onGoToSource?.(source.tab);
        }}
      />
    </>
  );
}
