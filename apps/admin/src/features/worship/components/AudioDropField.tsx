import { useRef } from "react";
import { Music, Upload, X, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SongAudio } from "../api/worship-api";
import { AUDIO_ACCEPT, validateAudioFile } from "../lib/audio";
import { formatClock } from "../lib/format";

interface AudioDropFieldProps {
  file: File | null;
  remoteAudio?: SongAudio | null;
  onChange: (file: File | null) => void;
  onClearRemoteAudio?: () => void;
  onOpenYoutube?: () => void;
  onInvalid: (message: string) => void;
  disabled?: boolean;
}

/** Campo "Enviar o áudio" dos formulários de música nova (o envio acontece ao organizar). */
export function AudioDropField({
  file,
  remoteAudio,
  onChange,
  onClearRemoteAudio,
  onOpenYoutube,
  onInvalid,
  disabled,
}: AudioDropFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Áudio <span className="font-medium normal-case tracking-normal">· opcional</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        className="hidden"
        aria-label="Arquivo de áudio"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!picked) return;
          const invalid = validateAudioFile(picked);
          if (invalid) onInvalid(invalid);
          else onChange(picked);
        }}
      />
      {remoteAudio ? (
        <div className="flex min-h-[72px] items-center gap-3.5 rounded-xl border bg-card px-4">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-red-500/10 text-red-600">
            <Youtube className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">{remoteAudio.fileName ?? "Áudio do YouTube"}</span>
            <span className="text-xs text-muted-foreground">
              {formatClock(remoteAudio.durationSeconds)} · Áudio de referência do YouTube
            </span>
          </div>
          <button
            type="button"
            aria-label="Tirar o áudio"
            disabled={disabled}
            onClick={onClearRemoteAudio}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : file ? (
        <div className="flex min-h-[72px] items-center gap-3.5 rounded-xl border bg-card px-4">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Music className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{file.name}</span>
          <button
            type="button"
            aria-label="Tirar o áudio"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[72px] flex-1 items-center gap-3.5 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-card px-4 text-left hover:border-primary"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">Enviar arquivo</span>
              <span className="text-[13px] text-muted-foreground">
                MP3 ou M4A local, até 90 MB.
              </span>
            </span>
          </button>

          {onOpenYoutube && (
            <Button
              type="button"
              variant="outline"
              className="flex min-h-[72px] flex-1 items-center justify-start gap-3.5 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-card px-4 text-left hover:border-red-500 hover:text-foreground h-auto"
              disabled={disabled}
              onClick={onOpenYoutube}
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                <Youtube className="h-5 w-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">Buscar no YouTube</span>
                <span className="text-[13px] text-muted-foreground font-normal">
                  Traz o áudio e a letra direto.
                </span>
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
