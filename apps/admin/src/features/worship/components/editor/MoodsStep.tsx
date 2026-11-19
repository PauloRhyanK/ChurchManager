import { RotateCcw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MOODS, deriveSong, type WorshipRow } from "../../lib/document";
import { formatClock } from "../../lib/format";
import { MOOD_META } from "../../lib/labels";
import { applySuggestedMoods, setPartMood } from "../../lib/row-ops";

interface MoodsStepProps {
  rows: WorshipRow[];
  duration: number | null;
  canEdit: boolean;
  onChange: (rows: WorshipRow[]) => void;
}

export function MoodsStep({ rows, duration, canEdit, onChange }: MoodsStepProps) {
  const { parts } = useMemo(() => deriveSong(rows), [rows]);
  // Largura de cada barra: quanto a parte dura; sem tempos, todas iguais.
  const timed = !!duration && parts.every((p) => p.time !== null);
  const weights = parts.map((p, i) =>
    timed && duration ? Math.max(1, (parts[i + 1]?.time ?? duration) - (p.time ?? 0)) : 1,
  );

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="min-w-0 flex-[1.8_1_560px] overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-3 border-b py-2 pl-5 pr-3">
          <Sparkles className="h-[18px] w-[18px] flex-none text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <b>Sugestão automática</b> <span className="text-muted-foreground">· troque onde quiser</span>
          </span>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Voltar à sugestão"
              title="Voltar à sugestão"
              onClick={() => onChange(applySuggestedMoods(rows))}
            >
              <RotateCcw className="h-[18px] w-[18px]" />
            </Button>
          )}
        </div>
        {parts.length === 0 && (
          <p className="px-5 py-8 text-muted-foreground">A música ainda não tem partes. Volte ao passo 1.</p>
        )}
        {parts.map((part, i) => (
          <div key={part.rowId} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${i === 0 ? "" : "border-t"}`}>
            <span className="flex flex-[1_1_120px] flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{part.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {part.time !== null ? formatClock(part.time) : "sem tempo"}
              </span>
            </span>
            <div role="group" aria-label={`Clima de ${part.name}`} className="flex flex-wrap gap-1.5">
              {MOODS.map((mood) => {
                const meta = MOOD_META[mood];
                const active = part.mood === mood;
                return (
                  <button
                    key={mood}
                    type="button"
                    aria-pressed={active}
                    disabled={!canEdit}
                    onClick={() => onChange(setPartMood(rows, part.rowId, mood))}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 text-[13px] font-semibold"
                    style={
                      active
                        ? { background: meta.color, borderColor: meta.color, color: meta.foreground }
                        : { background: "transparent", borderColor: "hsl(var(--border))" }
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: active ? meta.foreground : meta.color }}
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
        <section className="flex flex-col gap-3.5 rounded-xl border bg-card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Energia da música</h2>
          <div
            role="img"
            aria-label={`Energia de cada parte: ${parts.map((p) => `${p.name}, ${p.mood ? MOOD_META[p.mood].label : "sem clima"}`).join("; ")}`}
            className="flex h-32 items-end gap-1"
          >
            {parts.map((part, i) => (
              <div
                key={part.rowId}
                title={`${part.name}: ${part.mood ? MOOD_META[part.mood].label : "sem clima"}`}
                className="rounded-t-md"
                style={{
                  flex: `${weights[i]} 1 0`,
                  height: `${(part.mood ? MOOD_META[part.mood].level : 0.4) * 20}%`,
                  background: part.mood ? MOOD_META[part.mood].color : "hsl(var(--muted))",
                }}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-xl border bg-card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Os climas</h2>
          {MOODS.map((mood) => (
            <div key={mood} className="flex items-center gap-3">
              <span aria-hidden="true" className="h-7 w-7 flex-none rounded-lg" style={{ background: MOOD_META[mood].color }} />
              <span className="flex flex-col">
                <span className="font-semibold">{MOOD_META[mood].label}</span>
                <span className="text-[13px] text-muted-foreground">{MOOD_META[mood].hint}</span>
              </span>
            </div>
          ))}
          <p className="text-[13px] text-muted-foreground">
            Aqui fica só a escolha. O que cada clima faz com a luz é decidido na Ponte do Culto.
          </p>
        </section>
      </div>
    </div>
  );
}
