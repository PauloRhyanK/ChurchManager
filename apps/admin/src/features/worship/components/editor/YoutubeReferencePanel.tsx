import { Loader2, RefreshCw, X, Youtube } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import { removeSongReferenceYoutube, setSongReferenceYoutube, type Song } from "../../api/worship-api";
import { YoutubeSearchDialog } from "../YoutubeSearchDialog";

interface YoutubeReferencePanelProps {
  song: Song;
  canEdit: boolean;
  onChanged: (song: Song) => void;
}

/**
 * O vídeo do YouTube de referência, num player próprio. Ele não tem ligação
 * com o relógio do áudio-guia (VS com click): dá para ouvir a versão gravada
 * indo e voltando à vontade, e marcar os tempos no VS quantas vezes precisar.
 */
export function YoutubeReferencePanel({ song, canEdit, onChanged }: YoutubeReferencePanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const videoId = song.referenceYoutubeId;

  async function handleChoose(urlOrId: string) {
    const saved = await setSongReferenceYoutube(song.id, urlOrId);
    onChanged(saved);
    toast.success("Vídeo de referência salvo.");
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      onChanged(await removeSongReferenceYoutube(song.id));
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  const dialog = (
    <YoutubeSearchDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      initialQuery={song.title}
      purpose="reference"
      onImport={handleChoose}
    />
  );

  if (!videoId) {
    if (!canEdit) return null;
    return (
      <section
        aria-label="Referência do YouTube"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card px-5 py-4"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-red-500/10 text-red-600">
            <Youtube className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <b className="text-sm">Referência do YouTube · opcional</b>
            <span className="text-xs text-muted-foreground">
              Ouça a versão gravada à parte, sem mexer no relógio do VS.
            </span>
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Youtube className="h-4 w-4" />
          Escolher vídeo de referência
        </Button>
        {dialog}
      </section>
    );
  }

  return (
    <section aria-label="Referência do YouTube" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <b className="flex items-center gap-2 text-sm">
            <Youtube className="h-4 w-4 text-red-600" aria-hidden="true" />
            Referência do YouTube
          </b>
          <span className="text-xs text-muted-foreground">
            Toca à parte do VS. Depois de usar o player, clique fora dele para os atalhos de marcação voltarem.
          </span>
        </span>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Trocar o vídeo de referência"
              onClick={() => setDialogOpen(true)}
              disabled={removing}
              className="gap-1.5 text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Trocar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Tirar a referência"
              onClick={handleRemove}
              disabled={removing}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Tirar
            </Button>
          </div>
        )}
      </div>
      <div className="aspect-video w-full max-w-sm overflow-hidden rounded-lg bg-black">
        <iframe
          key={videoId}
          title={`Referência do YouTube: ${song.title}`}
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {dialog}
    </section>
  );
}
