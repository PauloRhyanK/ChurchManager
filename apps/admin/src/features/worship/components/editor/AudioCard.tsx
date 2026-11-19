import { useMutation } from "@tanstack/react-query";
import { Loader2, Music, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { uploadSongAudio, type Song } from "../../api/worship-api";
import { formatClock, readAudioDuration } from "../../lib/format";
import { AUDIO_ACCEPT, validateAudioFile } from "../AudioDropField";

interface AudioCardProps {
  song: Song;
  canEdit: boolean;
  onUploaded: (song: Song) => void;
}

/** O áudio-guia da música: mostra o arquivo atual e envia ou troca. */
export function AudioCard({ song, canEdit, onUploaded }: AudioCardProps) {
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
      <div>
        {input}
        <button
          type="button"
          disabled={!canEdit || upload.isPending}
          onClick={pick}
          className="flex min-h-[76px] w-full items-center gap-3.5 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-card px-5 text-left hover:border-primary disabled:opacity-60"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
            {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">{upload.isPending ? "Enviando o áudio…" : "Enviar o áudio"}</span>
            <span className="text-[13px] text-muted-foreground">Sem áudio a música não passa sozinha no culto.</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[76px] items-center gap-3.5 rounded-xl border bg-card pl-5 pr-3">
      {input}
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
        {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Music className="h-5 w-5" aria-hidden="true" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold">{song.audio.fileName ?? "Áudio-guia"}</span>
        <span className="text-[13px] font-semibold text-green-800">
          {upload.isPending ? "Enviando…" : `Áudio enviado · ${formatClock(song.audio.durationSeconds)}`}
        </span>
      </span>
      {canEdit && (
        <button
          type="button"
          aria-label="Trocar o áudio"
          title="Trocar o áudio"
          disabled={upload.isPending}
          onClick={pick}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <Upload className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
