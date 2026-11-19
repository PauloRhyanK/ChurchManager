import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { VerseAttrs } from "../lib/document";

export type ManualVerse = { reference: string; text: string };

/** Atributos de um Versículo digitado à mão: só referência e texto, o resto nulo. */
// eslint-disable-next-line react-refresh/only-export-components
export function manualVerseAttrs({ reference, text }: ManualVerse): Omit<VerseAttrs, "id"> {
  return { reference, book: null, chapter: null, verseStart: null, verseEnd: null, translation: null, verses: [{ number: null, text }] };
}

interface VerseDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Com valores: alterar um Versículo já inserido. Sem: inserir um novo. */
  initial?: ManualVerse;
  onSubmit(verse: ManualVerse): void;
  /** Só no modo de alteração. */
  onRemove?(): void;
}

const REFERENCE_MAX = 120;

/** Versículo digitado à mão (a busca na Bíblia vem depois). */
export function VerseDialog({ open, onOpenChange, initial, onSubmit, onRemove }: VerseDialogProps) {
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const editing = initial !== undefined;

  useEffect(() => {
    if (!open) return;
    setReference(initial?.reference ?? "");
    setText(initial?.text ?? "");
  }, [open, initial?.reference, initial?.text]);

  const verse = { reference: reference.trim(), text: text.trim() };
  const ready = verse.reference !== "" && verse.text !== "";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onSubmit(verse);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Alterar versículo" : "Inserir versículo"}</DialogTitle>
            <DialogDescription>Digite a referência e o texto do versículo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="verse-reference">Referência</Label>
            <Input
              id="verse-reference"
              value={reference}
              maxLength={REFERENCE_MAX}
              placeholder="João 3:16"
              required
              autoComplete="off"
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="verse-text">Texto</Label>
            <Textarea id="verse-text" value={text} rows={5} required onChange={(e) => setText(e.target.value)} />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing && onRemove ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  onRemove();
                  onOpenChange(false);
                }}
              >
                Remover
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={!ready}>
              {editing ? "Salvar" : "Inserir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
