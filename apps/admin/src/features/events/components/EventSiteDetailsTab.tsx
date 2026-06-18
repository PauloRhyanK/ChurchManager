import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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

type Props = { event: EventDto };

export function EventSiteDetailsTab({ event }: Props) {
  const queryClient = useQueryClient();
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [detailsHtml, setDetailsHtml] = useState("");

  useEffect(() => {
    setCoverImageUrl(event.coverImageUrl ?? "");
    setVideoUrl(event.videoUrl ?? "");
    setShortDescription(event.shortDescription ?? "");
    setDetailsHtml(event.detailsHtml ?? "");
  }, [event]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateEvent(event.id, {
        coverImageUrl: coverImageUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        shortDescription: shortDescription.trim() || null,
        detailsHtml: detailsHtml.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Detalhes do site actualizados.");
      void queryClient.invalidateQueries({ queryKey: ["event", event.id] });
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
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Upload de imagem via Cloudflare R2 activado. Vídeos ainda devem usar URL do YouTube ou Vimeo.
          </span>
        </div>

        <div className="space-y-2">
          <Label>Imagem de capa (16:9)</Label>
          <ImageUploader
            value={coverImageUrl}
            onChange={(url) => setCoverImageUrl(url ?? "")}
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
            placeholder="Resumo exibido nos cartões"
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

        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Guardar detalhes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
