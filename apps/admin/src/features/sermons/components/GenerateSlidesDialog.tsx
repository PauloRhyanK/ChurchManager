import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { generateSlides, getSermonAi, type Sermon } from "../api/sermons-api";
import type { SermonDoc } from "../lib/document";
import { SLIDE_THEMES } from "../lib/slide-identity";
import { slideErrorMessage } from "../lib/slide-errors";
import { countSlides, type SlideMode, type SlideStyle } from "../lib/slides";

type Choice = SlideMode;

const FORMATS: { mode: Choice; name: string; text: string }[] = [
  { mode: "VERSES", name: "Só versículos", text: "Na ordem em que aparecem" },
  { mode: "VERSES_AND_POINTS", name: "Versículos e pontos", text: "Mais o título e os pontos" },
  { mode: "FULL", name: "Slides completos", text: "Cada parte resumida numa frase por IA" },
];

const STYLES: SlideStyle[] = ["MINIMAL", "BACKGROUND"];

const AI_NOTICE = "O texto da palavra é enviado ao provedor de IA para gerar os resumos. As anotações “Só para mim” nunca são enviadas.";
const GENERATE_ERROR = "Não foi possível gerar os slides.";

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
  /** Aviso quando `ensureSaved` resolve `false` (padrão: pedir para salvar a palavra). */
  unsavedMessage?: string;
  /** Chamado com a palavra devolvida pelo servidor, já com os slides. */
  onGenerated(sermon: Sermon): void;
  /** Modo marcado ao abrir (padrão: Versículos e pontos). */
  initialMode?: SlideMode;
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
  const [mode, setMode] = useState<Choice>(initialMode);
  const [style, setStyle] = useState<SlideStyle>(initialStyle);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Só pergunta com o diálogo aberto; erro na consulta = IA desligada (tudo como sem IA).
  const ai = useQuery({ queryKey: ["sermons", "ai"], queryFn: getSermonAi, staleTime: 5 * 60_000, retry: false, enabled: open });
  const aiOn = ai.data?.enabled === true;
  const models = aiOn ? ai.data.models : [];
  const chosenModel = models.find((m) => m.id === model)?.id ?? models[0]?.id;

  // Volta ao padrão só quando o diálogo abre; mudanças das props com ele aberto não desfazem a escolha.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode(initialMode);
      setStyle(initialStyle);
      setError(null);
    }
    wasOpen.current = open;
  }, [open, initialStyle, initialMode]);

  /** Enquanto monta, o diálogo não fecha. */
  function changeOpen(next: boolean) {
    if (!next && busy) return;
    onOpenChange(next);
  }

  const counts = useMemo(() => (open ? countSlides(title, document) : { VERSES: 0, VERSES_AND_POINTS: 0, FULL: 0 }), [open, title, document]);
  // Slides completos sem IA ligada não existe: a escolha cai em Versículos e pontos.
  const effective: Choice = mode === "FULL" && !aiOn ? "VERSES_AND_POINTS" : mode;
  const chosen = counts[effective];

  // Enquanto a consulta da IA não volta, o modo mostrado pode ainda mudar: não monta.
  const aiLoading = ai.isLoading;

  async function build() {
    if (chosen === 0 || aiLoading) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await ensureSaved())) {
        toast.error(unsavedMessage);
        return;
      }
      const sermon = await generateSlides(sermonId, {
        mode: effective,
        style,
        ...(effective === "FULL" && models.length > 1 && chosenModel ? { model: chosenModel } : {}),
      });
      onOpenChange(false);
      onGenerated(sermon);
    } catch (err) {
      const message = slideErrorMessage(err, GENERATE_ERROR);
      if (effective === "FULL") setError(message);
      else toast.error(message);
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
          value={effective}
          onValueChange={(v) => {
            setMode(v as Choice);
            setError(null);
          }}
          className="flex flex-col gap-2"
        >
          {FORMATS.map((f) => (
            <RadioGroupPrimitive.Item
              key={f.mode}
              value={f.mode}
              disabled={f.mode === "FULL" && !aiOn}
              className={cn(
                "flex min-h-[60px] items-center gap-3 rounded-xl border-2 px-3.5 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("h-[18px] w-[18px] shrink-0 rounded-full border-2", effective === f.mode ? "border-[6px] border-primary" : "border-muted-foreground/60")}
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{f.name}</span>
                <span className="text-[13px] text-muted-foreground">{f.text}</span>
              </span>
              <span className="text-[13px] font-semibold text-muted-foreground">
                {f.mode === "FULL" && !aiOn ? "em breve" : plural(counts[f.mode])}
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
                className="flex aspect-video w-full items-center justify-center rounded-md text-xs"
                style={{ backgroundColor: SLIDE_THEMES[s].background, color: SLIDE_THEMES[s].color }}
              >
                Aa
              </span>
              {SLIDE_THEMES[s].name}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        {effective === "FULL" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{AI_NOTICE}</p>
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

        {chosen === 0 && (
          <p className="text-sm text-muted-foreground">Escreva um versículo ou um ponto para montar os slides.</p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" className="gap-2" disabled={busy || chosen === 0 || aiLoading} onClick={build}>
            <Sparkles aria-hidden="true" />
            {busy && effective === "FULL" ? "Resumindo…" : "Montar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
