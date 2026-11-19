import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { suggestTiming, type TimingSuggestion } from "../../api/worship-api";
import type { DerivedPart, DerivedSlide } from "../../lib/document";
import { formatClockTenths } from "../../lib/format";
import { changedCount } from "../../lib/timing";

interface TimingAiPanelProps {
  songId: string;
  slides: DerivedSlide[];
  parts: DerivedPart[];
  enabled: boolean;
  /** Salva o que estiver pendente antes de perguntar (a IA lê a música salva). */
  saveNow: () => Promise<boolean>;
  onApply: (suggestion: TimingSuggestion, instruction: string) => void;
}

const EXAMPLES = ["volta um slide em tudo", "adianta os slides do refrão", "o segundo verso está atrasado"];

const delta = (a: number | null, b: number | null) => {
  if (a === null || b === null) return "";
  const d = Math.round((b - a) * 10) / 10;
  if (d === 0) return "";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} s`;
};

/** Pedido em texto para a IA ajustar os tempos; a resposta vem como sugestão, com a diferença. */
export function TimingAiPanel({ songId, slides, parts, enabled, saveNow, onApply }: TimingAiPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [asked, setAsked] = useState("");
  const [suggestion, setSuggestion] = useState<TimingSuggestion | null>(null);

  const ask = useMutation({
    mutationFn: async (text: string) => {
      if (!(await saveNow())) throw new Error("Não foi possível salvar a música antes de pedir o ajuste.");
      return suggestTiming(songId, text);
    },
    onSuccess: (result, text) => {
      setAsked(text);
      setSuggestion(result);
    },
  });

  // A música mudou depois da pergunta (outro slide, outro tempo): a sugestão não vale mais.
  const stale =
    !!suggestion &&
    (suggestion.slideIds.length !== slides.length ||
      suggestion.slideIds.some((id, i) => id !== slides[i].rowId) ||
      suggestion.before.some((t, i) => t !== slides[i].time));
  const changed = suggestion ? changedCount(suggestion.before, suggestion.times) : 0;

  return (
    <section aria-label="Pedir ajuste à IA" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="font-semibold">Pedir ajuste à IA</h3>
      </div>
      {!enabled ? (
        <p className="text-[13px] text-muted-foreground">O ajuste por IA não está ligado neste servidor.</p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim()) ask.mutate(instruction.trim());
          }}
        >
          <Textarea
            aria-label="O que ajustar nos tempos"
            value={instruction}
            maxLength={300}
            rows={2}
            placeholder="Ex.: volta um slide em tudo"
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInstruction(ex)}
                className="rounded-full border px-2.5 py-0.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {ex}
              </button>
            ))}
            <span className="flex-1" />
            <Button type="submit" size="sm" className="gap-2" disabled={!instruction.trim() || ask.isPending}>
              {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Sugerir
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Nada muda até você aplicar. A sugestão usa as correções que a equipe já fez nesta igreja.
          </p>
          {ask.error && <p className="text-sm text-destructive">{getApiErrorMessage(ask.error)}</p>}
        </form>
      )}

      {suggestion && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3" aria-label="Sugestão da IA">
          <p className="text-sm">
            <b>“{asked}”</b> · {suggestion.summary || "Sugestão pronta."}{" "}
            <span className="text-muted-foreground">
              ({changed} {changed === 1 ? "slide muda" : "slides mudam"})
            </span>
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border bg-card">
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 bg-card text-left text-[12px] text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Slide</th>
                  <th className="w-16 px-2 py-1.5 text-right font-medium">Antes</th>
                  <th className="w-16 px-2 py-1.5 text-right font-medium">Depois</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {slides.map((s, i) => {
                  const before = suggestion.before[i] ?? null;
                  const after = suggestion.times[i] ?? null;
                  const moved = before !== after;
                  return (
                    <tr key={s.rowId} className={`border-t ${moved ? "bg-primary/5" : "text-muted-foreground"}`}>
                      <td className="truncate px-2 py-1">
                        <span className="tabular-nums">{i + 1}</span> · {parts[s.part]?.name} · {s.lines[0] ?? s.cues[0]?.text ?? ""}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatClockTenths(before)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${moved ? "font-semibold" : ""}`}>{formatClockTenths(after)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{delta(before, after)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stale && <p className="text-sm text-amber-800 dark:text-amber-300">Os tempos mudaram depois da pergunta. Peça de novo.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setSuggestion(null)}>
              <X className="h-4 w-4" />
              Descartar
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={stale || changed === 0}
              onClick={() => {
                onApply(suggestion, asked);
                setSuggestion(null);
                setInstruction("");
              }}
            >
              <Check className="h-4 w-4" />
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
