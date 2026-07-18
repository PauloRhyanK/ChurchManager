import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  resetSiteSection,
  updateSiteSection,
  type SiteSectionDto,
  type SiteSectionSpec,
  type SiteSectionValue,
} from "@/features/site/api/tenant-site-content-api";
import { getApiErrorMessage } from "@/lib/api";
import { SiteFieldInput } from "./SiteFieldInput";

interface SiteSectionSheetProps {
  section: SiteSectionDto | null;
  spec: SiteSectionSpec | undefined;
  icons: string[];
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SiteSectionSheet({
  section,
  spec,
  icons,
  canEdit,
  onOpenChange,
}: SiteSectionSheetProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SiteSectionValue>({});
  const [confirmReset, setConfirmReset] = useState(false);

  // Recarrega o rascunho sempre que abre outra secção.
  useEffect(() => {
    setDraft(section ? { ...section.value } : {});
  }, [section]);

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
      toast.success("Conteúdo reposto no original.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const busy = saveMutation.isPending || resetMutation.isPending;

  return (
    <>
      <Sheet open={section !== null} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{section?.title}</SheetTitle>
            <SheetDescription>{section?.description}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {spec?.fields.map((field) => (
              <SiteFieldInput
                key={field.name}
                spec={field}
                value={draft[field.name]}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, [field.name]: next }))
                }
                icons={icons}
                disabled={!canEdit || busy}
              />
            ))}
          </div>

          <SheetFooter className="flex-row items-center justify-between gap-3 border-t px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canEdit || busy}
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Repor original
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!canEdit || busy}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Guardar
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repor conteúdo original?</AlertDialogTitle>
            <AlertDialogDescription>
              As alterações feitas em "{section?.title}" são descartadas e a
              secção volta ao texto original. Não afeta as outras secções.
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
              Repor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
