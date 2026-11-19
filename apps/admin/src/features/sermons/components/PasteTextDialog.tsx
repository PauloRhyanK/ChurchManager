import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createSermonFromText, getSermonAi, type Sermon } from "../api/sermons-api";
import { slideErrorMessage } from "../lib/slide-errors";

/** Igual a PASTE_LIMITS.chars da API. */
export const PASTE_MAX_CHARS = 30_000;

const NOTICE =
  "A IA separa título, pontos, versículos, ilustrações e aplicações. O seu texto não é reescrito: ele só é dividido nos blocos do editor. Os versículos citados só pela referência vêm da Bíblia.";
const PRIVACY = "O texto colado é enviado ao provedor de IA para ser organizado.";
const ERROR = "Não foi possível organizar o texto.";

interface PasteTextDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Chamado com a palavra criada. */
  onCreated(sermon: Sermon): void;
}

export function PasteTextDialog({ open, onOpenChange, onCreated }: PasteTextDialogProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ai = useQuery({ queryKey: ["sermons", "ai"], queryFn: getSermonAi, staleTime: 5 * 60_000, retry: false, enabled: open });
  const models = ai.data?.enabled ? ai.data.models : [];
  const chosenModel = models.find((m) => m.id === model)?.id ?? models[0]?.id;

  // O texto colado fica enquanto o diálogo está aberto; ao abrir de novo, começa limpo.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setText("");
      setError(null);
    }
    wasOpen.current = open;
  }, [open]);

  function changeOpen(next: boolean) {
    if (!next && busy) return;
    onOpenChange(next);
  }

  const empty = text.trim() === "";
  const tooLong = text.length > PASTE_MAX_CHARS;

  async function organize() {
    if (empty || tooLong || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sermon = await createSermonFromText({ text, ...(models.length > 1 && chosenModel ? { model: chosenModel } : {}) });
      onOpenChange(false);
      onCreated(sermon);
    } catch (err) {
      setError(slideErrorMessage(err, ERROR));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-2xl" aria-label="Colar texto">
        <DialogHeader>
          <DialogTitle>Colar texto</DialogTitle>
          <DialogDescription>Cole a palavra como está escrita. A IA organiza no formato do esboço e cria a palavra.</DialogDescription>
        </DialogHeader>

        {ai.isLoading ? null : models.length === 0 ? (
          <Alert>
            <AlertDescription>Organizar texto com IA ainda não está disponível. Crie a palavra e cole o texto no editor.</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            <Textarea
              aria-label="Texto da palavra"
              placeholder={"A luz que não se apaga\n\n1. A luz chama\nJoão 8:12\n…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              className="min-h-[320px] font-mono text-sm"
            />
            <p className={tooLong ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
              {tooLong
                ? `O texto passa de ${PASTE_MAX_CHARS.toLocaleString("pt-BR")} caracteres. Cole uma parte de cada vez.`
                : `${text.length.toLocaleString("pt-BR")} de ${PASTE_MAX_CHARS.toLocaleString("pt-BR")} caracteres`}
            </p>
            <p className="text-sm text-muted-foreground">{NOTICE}</p>
            <p className="text-sm text-muted-foreground">{PRIVACY}</p>
            {models.length > 1 && (
              <select
                aria-label="Modelo de IA"
                value={chosenModel}
                onChange={(e) => setModel(e.target.value)}
                disabled={busy}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" className="gap-2" disabled={busy || empty || tooLong || models.length === 0} onClick={organize}>
            <Sparkles aria-hidden="true" />
            {busy ? "Organizando…" : "Organizar e criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
