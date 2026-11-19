import { Check, MessageSquare, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CUE_TARGETS, CUE_TARGET_LABEL, type CueTarget } from "../../lib/document";

export interface CueDraft {
  target: CueTarget;
  text: string;
}

interface CueDialogProps {
  open: boolean;
  /** Instrução existente (editar) ou null (inserir). */
  initial: CueDraft | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (cue: CueDraft) => void;
  onRemove?: () => void;
}

/** Recado para um músico. Aparece só no retorno do altar, nunca no telão. */
export function CueDialog({ open, initial, onOpenChange, onConfirm, onRemove }: CueDialogProps) {
  const [target, setTarget] = useState<CueTarget>("ALL");
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    setTarget(initial?.target ?? "ALL");
    setText(initial?.text ?? "");
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </span>
            Instrução
          </DialogTitle>
          <DialogDescription>Aparece só no retorno do altar, nunca no telão.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onConfirm({ target, text: text.trim() });
          }}
        >
          <div role="group" aria-label="Para quem" className="flex flex-wrap gap-1.5">
            {CUE_TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={target === t}
                onClick={() => setTarget(t)}
                className={
                  target === t
                    ? "min-h-11 rounded-full border-2 border-amber-800 bg-amber-800 px-3.5 text-sm font-semibold text-white"
                    : "min-h-11 rounded-full border border-input bg-background px-3.5 text-sm hover:bg-accent"
                }
              >
                {CUE_TARGET_LABEL[t]}
              </button>
            ))}
          </div>
          <Input
            aria-label="O que fazer"
            value={text}
            maxLength={200}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            placeholder="entra, sai, sobe, cai…"
            className="h-12 text-base"
          />
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {onRemove ? (
              <Button type="button" variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2.5">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!text.trim()} className="gap-2">
                <Check className="h-4 w-4" />
                {initial ? "Salvar" : "Inserir"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
