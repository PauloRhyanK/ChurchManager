import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { printHtml } from "@/lib/print";
import { listBibleTranslations } from "../api/sermons-api";
import { buildSermonHtml } from "../export/sermon-print";
import { buildDeck } from "../export/slides-deck";
import { downloadPptx } from "../export/slides-pptx";
import { exportFileName } from "../export/file-name";
import {
  buildVersesText,
  downloadText,
  usedTranslations,
} from "../export/verses-text";
import type { SermonDoc } from "../lib/document";
import type { SlideItem, SlideStyle } from "../lib/slides";

const HOUR_MS = 60 * 60 * 1000;

interface ExportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Título e texto como estão na tela. */
  title: string;
  document: SermonDoc;
  /** "3 min de fala", já formatado. */
  speech: string;
  slides: SlideItem[];
  slideStyle: SlideStyle;
}

function Option({
  badge,
  name,
  text,
  disabled,
  busy,
  onClick,
}: {
  badge: string;
  name: string;
  text: string;
  disabled?: boolean;
  busy?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="flex min-h-[68px] w-full items-center gap-3.5 rounded-xl border bg-background px-3.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-[11px] font-bold text-primary">
        {badge}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{name}</span>
        <span className="text-[13px] text-muted-foreground">
          {busy ? "Gerando…" : text}
        </span>
      </span>
      {busy ? (
        <Loader2
          className="h-[18px] w-[18px] flex-none animate-spin"
          aria-hidden="true"
        />
      ) : (
        <Download className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
      )}
    </button>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  title,
  document,
  speech,
  slides,
  slideStyle,
}: ExportDialogProps) {
  const [includePrivate, setIncludePrivate] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Mesma consulta do seletor de versículos: normalmente já está em cache.
  const translations = useQuery({
    queryKey: ["sermons", "bible", "translations"],
    queryFn: listBibleTranslations,
    staleTime: HOUR_MS,
    enabled: open,
  });

  const deck = buildDeck(slides, slideStyle);
  const verseCount = document.content.filter((b) => b.type === "verse").length;

  function credits(): string[] {
    const known = translations.data ?? [];
    return usedTranslations(document).map(
      (code) => known.find((t) => t.code === code)?.attribution || code,
    );
  }

  function exportPdf() {
    const html = buildSermonHtml({
      title,
      document,
      speech,
      includePrivate,
      credits: credits(),
    });
    if (!printHtml(html))
      toast.error("Permita janelas pop-up para exportar o PDF.");
  }

  async function exportPptx() {
    setGenerating(true);
    try {
      await downloadPptx(exportFileName(title, "pptx"), title, deck);
    } catch {
      toast.error("Não foi possível gerar a apresentação.");
    } finally {
      setGenerating(false);
    }
  }

  function exportText() {
    downloadText(
      exportFileName(title, "txt"),
      buildVersesText({ title, document, credits: credits() }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Exportar</DialogTitle>
          <DialogDescription className="sr-only">
            Escolha o que baixar desta palavra.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Option
            badge="PDF"
            name="O sermão"
            text="O texto inteiro, para imprimir ou ler no tablet"
            onClick={exportPdf}
          />
          <Option
            badge="PPT"
            name="Os slides"
            text={
              deck.length === 0
                ? "Gere os slides primeiro."
                : `${deck.length} ${deck.length === 1 ? "slide" : "slides"}, no visual escolhido`
            }
            disabled={deck.length === 0}
            busy={generating}
            onClick={() => void exportPptx()}
          />
          <Option
            badge="TXT"
            name="Só os versículos"
            text={
              verseCount === 0
                ? "Esta palavra ainda não tem versículos."
                : verseCount === 1
                  ? "A referência, na ordem"
                  : `As ${verseCount} referências, na ordem`
            }
            disabled={verseCount === 0}
            onClick={exportText}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
          <Checkbox
            className="mt-0.5 h-5 w-5"
            checked={includePrivate}
            onCheckedChange={(v) => setIncludePrivate(v === true)}
          />
          <span className="flex flex-col">
            <span>Incluir as anotações “Só para mim”</span>
            <span className="text-[13px] text-muted-foreground">
              Vale só para o PDF.
            </span>
          </span>
        </label>
      </DialogContent>
    </Dialog>
  );
}
