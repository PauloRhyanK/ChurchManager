import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SlidePreview } from "@/features/sermons/components/SlidePreview";
import { getApiErrorMessage } from "@/lib/api";
import { getServiceSermon } from "../../api/worship-api";

interface SermonPreviewDialogProps {
  serviceId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Slides da palavra do culto, só para ver. "Abrir a palavra" só para o autor. */
export function SermonPreviewDialog({ serviceId, open, onOpenChange }: SermonPreviewDialogProps) {
  const query = useQuery({
    queryKey: ["worship", "service-sermon", serviceId],
    queryFn: () => getServiceSermon(serviceId),
    enabled: open,
    // Os slides mudam na conferência sem invalidar o roteiro: cada abertura busca de novo.
    staleTime: 0,
    // Focar a janela não pode trocar os slides pelo carregando.
    refetchOnWindowFocus: false,
  });
  const data = query.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.title ?? "Palavra"}</DialogTitle>
          <DialogDescription>{data ? `Palavra de ${data.preacherName}` : "Slides da palavra deste culto."}</DialogDescription>
        </DialogHeader>

        {/* Ao reabrir, os slides guardados podem ser antigos: espera a busca nova. */}
        {query.isPending || query.isFetching ? (
          <div className="flex justify-center py-10" role="status" aria-label="Carregando">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : query.isError || !data ? (
          <p className="text-sm text-destructive">{getApiErrorMessage(query.error)}</p>
        ) : data.slides.length === 0 ? (
          <p className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">Esta palavra ainda não tem slides.</p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3">
            {data.slides.map((slide, i) => (
              <SlidePreview key={i} slide={slide} style={data.slideStyle} size="sm" />
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {data?.mySermonId && (
            <Button asChild variant="outline">
              <Link to={`/palavras/${data.mySermonId}`}>Abrir a palavra</Link>
            </Button>
          )}
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
