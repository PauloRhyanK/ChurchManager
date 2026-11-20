import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { generateSlides, type Sermon } from "../api/sermons-api";
import type { SermonDoc } from "../lib/document";
import { SLIDE_THEMES } from "../lib/slide-identity";
import { slideErrorMessage } from "../lib/slide-errors";
import { countSlides, readSlideMode, type SlideMode, type SlideStyle, type StoredSlideMode } from "../lib/slides";

const FORMATS: { mode: SlideMode; name: string; text: string }[] = [
  { mode: "VERSES_AND_POINTS", name: "Com versículos", text: "Título, visão geral e o versículo de cada tópico" },
  { mode: "TITLES", name: "Só títulos", text: "Título, visão geral e o título de cada tópico" },
];

const STYLES: SlideStyle[] = ["MINIMAL", "BACKGROUND"];

const GENERATE_ERROR = "Não foi possível gerar os slides.";

const plural = (n: number) => `${n} ${n === 1 ? "slide" : "slides"}`;

interface GenerateSlidesDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  sermonId: string;
  /** Título e texto como estão na tela (as contagens saem daqui). */
  title: string;
  document: SermonDoc;
  /** Variação de cor já gravada na palavra. */
  initialStyle: SlideStyle;
  /** Salva o que está na tela; resolve com `true` se não sobrou nada sem salvar. */
  ensureSaved(): Promise<boolean>;
  /** Aviso quando `ensureSaved` resolve `false` (padrão: pedir para salvar a palavra). */
  unsavedMessage?: string;
  /** Chamado com a palavra devolvida pelo servidor, já com os slides. */
  onGenerated(sermon: Sermon): void;
  /** Modo marcado ao abrir (padrão: Com versículos; modos antigos valem como Com versículos). */
  initialMode?: StoredSlideMode;
  /** Aviso acima dos botões (ex.: ao gerar de novo). */
  notice?: string;
}

export function GenerateSlidesDialog({
  open,
  onOpenChange,
  sermonId,
  title,
  document,
  initialStyle,
  ensureSaved,
  unsavedMessage = "Salve a palavra antes de montar os slides.",
  onGenerated,
  initialMode = "VERSES_AND_POINTS",
  notice,
}: GenerateSlidesDialogProps) {
  const startMode = readSlideMode(initialMode) ?? "VERSES_AND_POINTS";
  const [mode, setMode] = useState<SlideMode>(startMode);
  const [style, setStyle] = useState<SlideStyle>(initialStyle);
  const [busy, setBusy] = useState(false);

  // Volta ao padrão só quando o diálogo abre; mudanças das props com ele aberto não desfazem a escolha.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode(startMode);
      setStyle(initialStyle);
    }
    wasOpen.current = open;
  }, [open, initialStyle, startMode]);

  /** Enquanto monta, o diálogo não fecha. */
  function changeOpen(next: boolean) {
    if (!next && busy) return;
    onOpenChange(next);
  }

  const counts = useMemo(() => (open ? countSlides(title, document) : { VERSES_AND_POINTS: 0, TITLES: 0 }), [open, title, document]);
  const chosen = counts[mode];

  async function build() {
    if (chosen === 0) return;
    setBusy(true);
    try {
      if (!(await ensureSaved())) {
        toast.error(unsavedMessage);
        return;
      }
      const sermon = await generateSlides(sermonId, { mode, style });
      onOpenChange(false);
      onGenerated(sermon);
    } catch (err) {
      toast.error(slideErrorMessage(err, GENERATE_ERROR));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-lg" aria-label="Gerar slides">
        <DialogHeader>
          <DialogTitle>Gerar slides</DialogTitle>
          <DialogDescription>Escolha o que o telão mostra e como fica.</DialogDescription>
        </DialogHeader>

        <RadioGroupPrimitive.Root
          aria-label="O que mostrar"
          value={mode}
          onValueChange={(v) => setMode(v as SlideMode)}
          className="flex flex-col gap-2"
        >
          {FORMATS.map((f) => (
            <RadioGroupPrimitive.Item
              key={f.mode}
              value={f.mode}
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
                {plural(counts[f.mode])}
              </span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        <RadioGroupPrimitive.Root
          aria-label="Cores"
          value={style}
          onValueChange={(v) => setStyle(v as SlideStyle)}
          className="grid grid-cols-2 gap-2"
        >
          {STYLES.map((s) => (
            <RadioGroupPrimitive.Item
              key={s}
              value={s}
              className={cn(
                "flex flex-col gap-2 rounded-xl border-2 p-2 text-sm font-semibold",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5",
              )}
            >
              <span
                aria-hidden="true"
                className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-md"
                style={{ backgroundColor: SLIDE_THEMES[s].background }}
              >
                <span className="h-1 w-6 rounded-full" style={{ backgroundColor: SLIDE_THEMES[s].accent }} />
                <span
                  className="h-1/3 w-3/4 rounded border"
                  style={{ backgroundColor: SLIDE_THEMES[s].panel, borderColor: SLIDE_THEMES[s].border }}
                />
              </span>
              {SLIDE_THEMES[s].name}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        {chosen === 0 && (
          <p className="text-sm text-muted-foreground">Escreva um versículo ou um ponto para montar os slides.</p>
        )}

        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeOpen(false)}>
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
