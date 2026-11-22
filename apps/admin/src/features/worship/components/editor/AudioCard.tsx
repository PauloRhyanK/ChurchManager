import { useMutation } from "@tanstack/react-query";
import { Loader2, Music, Upload, Youtube } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import { setSongReferenceYoutube, setSongYoutubeAudio, uploadSongAudio, type Song } from "../../api/worship-api";
import { AUDIO_ACCEPT, validateAudioFile } from "../../lib/audio";
import { formatClock, readAudioDuration } from "../../lib/format";
import { YoutubeSearchDialog } from "../YoutubeSearchDialog";

interface AudioCardProps {
  song: Song;
  canEdit: boolean;
  onUploaded: (song: Song) => void;
}

/**
 * O áudio-guia da música (o VS com click): mostra o arquivo atual e envia ou troca.
 * Sem áudio, o YouTube pode virar o áudio-guia; com áudio, o YouTube só entra
 * como vídeo de referência e nunca troca o VS.
 */
export function AudioCard({ song, canEdit, onUploaded }: AudioCardProps) {
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hadTimes = song.rows.some((r) => typeof r.time === "number");

  const upload = useMutation({
    mutationFn: async (file: File) => uploadSongAudio(song.id, file, await readAudioDuration(file)),
    onSuccess: (saved) => {
      onUploaded(saved);
      toast.success(hadTimes ? "Áudio trocado. Confira os tempos dos slides." : "Áudio enviado.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  async function handleImportYoutube(urlOrId: string) {
    try {
      const saved = await setSongYoutubeAudio(song.id, urlOrId);
      onUploaded(saved);
      toast.success(hadTimes ? "Áudio trocado pelo YouTube. Confira os tempos dos slides." : "Áudio do YouTube importado!");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  async function handleReference(urlOrId: string) {
    const saved = await setSongReferenceYoutube(song.id, urlOrId);
    onUploaded(saved);
    toast.success("Vídeo de referência salvo. Ele aparece na marcação dos tempos.");
  }

  const pick = () => inputRef.current?.click();
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={AUDIO_ACCEPT}
      className="hidden"
      aria-label="Arquivo de áudio"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const invalid = validateAudioFile(file);
        if (invalid) toast.error(invalid);
        else upload.mutate(file);
      }}
    />
  );

  if (!song.audio) {
    return (
      <div className="flex flex-col gap-2">
        {input}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={!canEdit || upload.isPending}
            onClick={pick}
            className="flex min-h-[76px] flex-1 items-center gap-3.5 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-card px-4 text-left hover:border-primary disabled:opacity-60"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
              {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{upload.isPending ? "Enviando…" : "Enviar áudio local"}</span>
              <span className="text-[12px] text-muted-foreground">MP3 ou M4A do seu computador.</span>
            </span>
          </button>

          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || upload.isPending}
            onClick={() => setYoutubeOpen(true)}
            className="flex min-h-[76px] flex-1 items-center justify-start gap-3.5 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-card px-4 text-left hover:border-red-500 hover:text-foreground h-auto disabled:opacity-60"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-red-500/10 text-red-600">
              <Youtube className="h-5 w-5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">Buscar no YouTube</span>
              <span className="text-[12px] text-muted-foreground font-normal">Baixa o áudio de referência direto.</span>
            </span>
          </Button>
        </div>

        <YoutubeSearchDialog
          open={youtubeOpen}
          onOpenChange={setYoutubeOpen}
          initialQuery={song.title}
          onImport={handleImportYoutube}
        />
      </div>
    );
  }

  const isYoutube = song.audio.url.includes("youtube") || (song.audio.fileName && song.audio.fileName.includes("youtube"));

  return (
    <div className="flex min-h-[76px] items-center gap-3.5 rounded-xl border bg-card pl-5 pr-3">
      {input}
      <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${isYoutube ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}>
        {upload.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isYoutube ? (
          <Youtube className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Music className="h-5 w-5" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold">{song.audio.fileName ?? "Áudio-guia"}</span>
        <span className="text-[13px] font-semibold text-green-800">
          {upload.isPending ? "Enviando…" : `Áudio pronto · ${formatClock(song.audio.durationSeconds)}`}
        </span>
      </span>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Escolher vídeo de referência do YouTube"
            title="Vídeo de referência do YouTube (não troca o áudio-guia)"
            disabled={upload.isPending}
            onClick={() => setYoutubeOpen(true)}
            className="text-muted-foreground hover:text-red-600"
          >
            <Youtube className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Trocar o arquivo de áudio"
            title="Trocar arquivo de áudio"
            disabled={upload.isPending}
            onClick={pick}
            className="text-muted-foreground hover:text-foreground"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      )}

      <YoutubeSearchDialog
        open={youtubeOpen}
        onOpenChange={setYoutubeOpen}
        initialQuery={song.title}
        purpose="reference"
        onImport={handleReference}
      />
    </div>
  );
}
