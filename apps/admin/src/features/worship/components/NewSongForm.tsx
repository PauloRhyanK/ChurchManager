import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudioDropField } from "./AudioDropField";

export interface NewSongDraft {
  title: string;
  rawLyrics: string;
  file: File | null;
}

interface NewSongFormProps {
  draft: NewSongDraft;
  onChange: (draft: NewSongDraft) => void;
  onOrganize: () => void;
  /** Botões à esquerda do "Organizar" (Cancelar, Só adicionar ao roteiro…). */
  secondary: ReactNode;
  busy?: boolean;
  idPrefix: string;
}

/** Nome, letra e áudio opcional: o formulário de música nova, na página e no modal do roteiro. */
export function NewSongForm({ draft, onChange, onOrganize, secondary, busy, idPrefix }: NewSongFormProps) {
  const ready = draft.title.trim().length > 0 && draft.rawLyrics.trim().length > 0;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onOrganize();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-nome`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Nome da música
        </Label>
        <Input
          id={`${idPrefix}-nome`}
          value={draft.title}
          maxLength={255}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="Como a equipe chama esta música"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-letra`} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Letra
        </Label>
        <Textarea
          id={`${idPrefix}-letra`}
          value={draft.rawLyrics}
          maxLength={20000}
          onChange={(e) => onChange({ ...draft, rawLyrics: e.target.value })}
          placeholder="Cole do jeito que veio, com os recados da banda."
          className="min-h-[220px] resize-y rounded-xl px-5 py-4 text-base leading-relaxed"
        />
        <p className="text-[13px] text-muted-foreground">
          Linha em branco separa as partes. <code>//</code> é recado para a banda e <code>(2x)</code> repete a linha.
        </p>
      </div>
      <AudioDropField
        file={draft.file}
        onChange={(file) => onChange({ ...draft, file })}
        onInvalid={(message) => toast.error(message)}
        disabled={busy}
      />
      <div className="flex flex-wrap justify-end gap-2.5">
        {secondary}
        <Button type="submit" disabled={!ready || busy} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Organizar
        </Button>
      </div>
    </form>
  );
}
