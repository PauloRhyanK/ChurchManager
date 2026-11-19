import { useRef } from "react";
import { Music, Upload, X } from "lucide-react";

export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*";
export const MAX_AUDIO_BYTES = 90 * 1024 * 1024;

/** Mesma regra da API: até 90 MB. Devolve a mensagem de erro, ou null. */
export function validateAudioFile(file: { size: number }): string | null {
  return file.size > MAX_AUDIO_BYTES ? "O áudio excede o limite de 90 MB. Prefira MP3 ou M4A." : null;
}

interface AudioDropFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
  onInvalid: (message: string) => void;
  disabled?: boolean;
}

/** Campo "Enviar o áudio" dos formulários de música nova (o envio acontece ao organizar). */
export function AudioDropField({ file, onChange, onInvalid, disabled }: AudioDropFieldProps) {
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
      {file ? (
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
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[72px] items-center gap-3.5 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-card px-4 text-left hover:border-primary"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Enviar o áudio</span>
            <span className="text-[13px] text-muted-foreground">
              VS com click ou a gravação de referência. MP3 ou M4A, até 90 MB.
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
