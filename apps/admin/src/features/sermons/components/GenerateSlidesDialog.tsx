import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { generateSlides, type Sermon } from "../api/sermons-api";
import type { SermonDoc } from "../lib/document";
import { countSlides, type SlideMode, type SlideStyle } from "../lib/slides";
import { SLIDE_BACKGROUNDS } from "./SlidePreview";

type Choice = SlideMode;

const FORMATS: { mode: Choice; name: string; text: string; soon?: boolean }[] = [
  { mode: "VERSES", name: "Só versículos", text: "Na ordem em que aparecem" },
  { mode: "VERSES_AND_POINTS", name: "Versículos e pontos", text: "Mais o título e os pontos" },
  { mode: "FULL", name: "Slides completos", text: "Cada parte resumida numa frase", soon: true },
];

const STYLES: { style: SlideStyle; name: string }[] = [
  { style: "MINIMAL", name: "Minimalista" },
  { style: "BACKGROUND", name: "Com fundo" },
];

const plural = (n: number) => `${n} ${n === 1 ? "slide" : "slides"}`;

interface GenerateSlidesDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  sermonId: string;
  /** Título e texto como estão na tela (as contagens saem daqui). */
  title: string;
  document: SermonDoc;
  /** Visual já gravado na palavra. */
  initialStyle: SlideStyle;
  /** Salva o que está na tela; resolve com `true` se não sobrou nada sem salvar. */
  ensureSaved(): Promise<boolean>;
  /** Chamado com a palavra devolvida pelo servidor, já com os slides. */
  onGenerated(sermon: Sermon): void;
}

export function GenerateSlidesDialog({
  open,
  onOpenChange,
  sermonId,
  title,
  document,
  initialStyle,
  ensureSaved,
  onGenerated,
}: GenerateSlidesDialogProps) {
  const [mode, setMode] = useState<Choice>("VERSES_AND_POINTS");
  const [style, setStyle] = useState<SlideStyle>(initialStyle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("VERSES_AND_POINTS");
      setStyle(initialStyle);
    }
  }, [open, initialStyle]);

  const counts = useMemo(() => (open ? countSlides(title, document) : { VERSES: 0, VERSES_AND_POINTS: 0 }), [open, title, document]);
  const chosen = mode === "FULL" ? 0 : counts[mode];

  async function build() {
    if (mode === "FULL" || chosen === 0) return;
    setBusy(true);
    try {
      if (!(await ensureSaved())) {
        toast.error("Salve a palavra antes de montar os slides.");
        return;
      }
      const sermon = await generateSlides(sermonId, { mode, style });
      onOpenChange(false);
      onGenerated(sermon);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-label="Gerar slides">
        <DialogHeader>
          <DialogTitle>Gerar slides</DialogTitle>
          <DialogDescription>Escolha o que o telão mostra e como fica.</DialogDescription>
        </DialogHeader>

        <RadioGroupPrimitive.Root
          aria-label="O que mostrar"
          value={mode}
          onValueChange={(v) => setMode(v as Choice)}
          className="flex flex-col gap-2"
        >
          {FORMATS.map((f) => (
            <RadioGroupPrimitive.Item
              key={f.mode}
              value={f.mode}
              disabled={f.soon}
              className={cn(
                "flex min-h-[60px] items-center gap-3 rounded-xl border-2 px-3.5 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("h-[18px] w-[18px] shrink-0 rounded-full border-2", mode === f.mode ? "border-[6px] border-primary" : "border-muted-foreground/60")}
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{f.name}</span>
                <span className="text-[13px] text-muted-foreground">{f.text}</span>
              </span>
              <span className="text-[13px] font-semibold text-muted-foreground">
                {f.soon ? "em breve" : plural(counts[f.mode as "VERSES" | "VERSES_AND_POINTS"])}
              </span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        <RadioGroupPrimitive.Root
          aria-label="Visual do slide"
          value={style}
          onValueChange={(v) => setStyle(v as SlideStyle)}
          className="grid grid-cols-2 gap-2"
        >
          {STYLES.map((s) => (
            <RadioGroupPrimitive.Item
              key={s.style}
              value={s.style}
              className={cn(
                "flex flex-col gap-2 rounded-xl border-2 p-2 text-sm font-semibold",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5",
              )}
            >
              <span
                aria-hidden="true"
                className="flex aspect-video w-full items-center justify-center rounded-md text-xs"
                style={{ backgroundColor: SLIDE_BACKGROUNDS[s.style], color: "#F5F6FA" }}
              >
                Aa
              </span>
              {s.name}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        {chosen === 0 && mode !== "FULL" && (
          <p className="text-sm text-muted-foreground">Escreva um versículo ou um ponto para montar os slides.</p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" className="gap-2" disabled={busy || chosen === 0} onClick={build}>
            <Sparkles aria-hidden="true" />
            Montar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
