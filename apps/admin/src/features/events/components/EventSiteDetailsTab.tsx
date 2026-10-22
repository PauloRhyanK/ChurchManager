import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/ImageUploader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateEvent,
  type EventDto,
} from "@/features/events/api/tenant-events-api";
import { getApiErrorMessage } from "@/lib/api";

type Props = { event: EventDto; canEdit: boolean };

/**
 * O estado local é inicializado uma única vez a partir do evento (o pai
 * remonta o componente por `key` ao mudar de evento): refetches do evento não
 * podem apagar o que já foi digitado.
 */
export function EventSiteDetailsTab({ event, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [coverImageUrl, setCoverImageUrl] = useState(event.coverImageUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(event.videoUrl ?? "");
  const [shortDescription, setShortDescription] = useState(event.shortDescription ?? "");
  const [detailsHtml, setDetailsHtml] = useState(event.detailsHtml ?? "");

  const coverMutation = useMutation({
    mutationFn: (coverUrl: string | null) =>
      updateEvent(event.id, { coverImageUrl: coverUrl }),
    onSuccess: (data) => {
      toast.success("Capa do evento actualizada.");
      setCoverImageUrl(data.coverImageUrl ?? "");
      queryClient.setQueryData<EventDto>(["event", event.id], (old) =>
        old ? { ...old, coverImageUrl: data.coverImageUrl } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateEvent(event.id, {
        coverImageUrl: coverImageUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        shortDescription: shortDescription.trim() || null,
        detailsHtml: detailsHtml.trim() || null,
      }),
    onSuccess: (data) => {
      toast.success("Detalhes do site actualizados.");
      void queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      setCoverImageUrl(data.coverImageUrl ?? "");
      setVideoUrl(data.videoUrl ?? "");
      setShortDescription(data.shortDescription ?? "");
      setDetailsHtml(data.detailsHtml ?? "");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Detalhes do site</CardTitle>
        <CardDescription>
          Mídia e descrição longa exibidas na página pública do evento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
          <div className="space-y-2">
            <Label>Imagem de capa (16:9)</Label>
            <ImageUploader
              value={coverImageUrl}
              hint="Imagem da capa do evento, proporção 16:9 (ex.: 1920x1080). JPEG, PNG, WebP ou GIF, até 5 MB."
              disabled={!canEdit || coverMutation.isPending}
              onChange={(url) => {
                const next = url ?? "";
                setCoverImageUrl(next);
                coverMutation.mutate(next.trim() || null);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-video">URL do vídeo</Label>
            <Input
              id="site-video"
              type="url"
              placeholder="https://youtube.com/…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-short">Descrição curta</Label>
            <Textarea
              id="site-short"
              rows={2}
              maxLength={500}
              placeholder="Resumo exibido nos cartões e no topo da página do evento"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-details">Descrição longa</Label>
            <Textarea
              id="site-details"
              rows={8}
              placeholder="Detalhes completos do evento (texto ou HTML simples)"
              value={detailsHtml}
              onChange={(e) => setDetailsHtml(e.target.value)}
            />
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Guardar detalhes
              </Button>
            </div>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
