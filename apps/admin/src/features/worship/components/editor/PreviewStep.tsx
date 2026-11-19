import { Check, Copy, MessageSquare, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Song } from "../../api/worship-api";
import {
  CUE_TARGET_LABEL,
  deriveSong,
  holyricsText,
  songPending,
  type WorshipRow,
} from "../../lib/document";
import { formatClock } from "../../lib/format";
import { MOOD_META } from "../../lib/labels";
import { currentSlideIndex } from "../../lib/timing";
import { PartsTimeline } from "./PartsTimeline";
import { usePlayer } from "./usePlayer";

interface PreviewStepProps {
  song: Song;
  rows: WorshipRow[];
}

/** Como a música vai passar no culto: telão e retorno do altar seguindo o áudio. */
export function PreviewStep({ song, rows }: PreviewStepProps) {
  const { parts, slides } = useMemo(() => deriveSong(rows), [rows]);
  const player = usePlayer(song.audio?.url ?? null);
  const duration = player.duration ?? song.audio?.durationSeconds ?? null;
  const pending = songPending(rows, { url: song.audio?.url ?? null, durationSeconds: duration });
  const [watched, setWatched] = useState(false);
  useEffect(() => {
    if (player.ended) setWatched(true);
  }, [player.ended]);

  const index = currentSlideIndex(slides, player.time);
  const slide = index >= 0 ? slides[index] : null;
  const nextSlide = slides[index + 1];
  const part = slide ? parts[slide.part] : null;
  const mood = part?.mood ? MOOD_META[part.mood] : null;
  const text = useMemo(() => holyricsText(rows), [rows]);

  const goToPart = (delta: number) => {
    const target = parts[(part?.index ?? -1) + delta] ?? (delta < 0 ? parts[0] : undefined);
    if (target?.time !== null && target?.time !== undefined) player.seek(target.time);
  };

  const checks: { label: string; ok: boolean; optional?: boolean }[] = [
    { label: `Letra · ${slides.length} ${slides.length === 1 ? "slide" : "slides"}`, ok: slides.length > 0 },
    { label: song.audio ? `Áudio · ${formatClock(duration)}` : "Áudio", ok: !pending.includes("AUDIO") && slides.length > 0 },
    { label: "Tempo de todos os slides", ok: !pending.includes("TIMES") && slides.length > 0 },
    { label: "Clima de todas as partes", ok: !pending.includes("MOODS") && slides.length > 0 },
    { label: "Prévia assistida até o fim", ok: watched, optional: true },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Letra copiada. Cole no Holyrics.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e use Ctrl+C.");
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="flex min-w-0 flex-[2_1_560px] flex-col gap-5 rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Telão</span>
            <div data-testid="telao" className="flex aspect-video items-center justify-center rounded-lg bg-[#05070B] p-4">
              <span className="whitespace-pre-line text-center text-lg font-bold leading-snug text-[#F5F6FA] sm:text-xl">
                {slide?.lines.join("\n")}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Retorno do altar</span>
            <div data-testid="retorno" className="flex aspect-video flex-col items-center justify-center gap-2.5 rounded-lg bg-[#111827] p-4">
              {slide?.cues.map((cue, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-amber-300 px-2.5 py-1 text-[13px] font-semibold text-amber-950">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  {CUE_TARGET_LABEL[cue.target]} · {cue.text}
                </span>
              ))}
              <span className="whitespace-pre-line text-center text-base font-bold leading-snug text-[#F5F6FA] sm:text-lg">
                {slide?.lines.join("\n")}
              </span>
              {nextSlide && (
                <span className="text-center text-xs text-white/60">
                  A seguir: {nextSlide.lines[0] ?? (nextSlide.cues[0] ? `(${nextSlide.cues[0].text})` : "(sem letra)")}
                </span>
              )}
            </div>
          </div>
        </div>

        {!song.audio ? (
          <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
            Sem áudio não há o que tocar. Envie o áudio no passo 2 para assistir à prévia.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {player.failed && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                Não foi possível tocar o áudio.
              </p>
            )}
            <PartsTimeline
              parts={parts}
              duration={duration}
              time={player.time}
              onSeek={player.seek}
              colorOf={(p) =>
                p.mood
                  ? { background: MOOD_META[p.mood].color, color: MOOD_META[p.mood].foreground }
                  : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              }
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="icon" aria-label="Parte anterior" onClick={() => goToPart(-1)}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <button
                type="button"
                aria-label={player.playing ? "Pausar" : "Tocar"}
                onClick={player.toggle}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {player.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <Button variant="outline" size="icon" aria-label="Próxima parte" onClick={() => goToPart(1)}>
                <SkipForward className="h-4 w-4" />
              </Button>
              <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
                {part && (
                  <>
                    <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: mood?.color ?? "#9CA3AF" }} />
                    <span className="truncate">
                      {part.name} · {mood?.label ?? "sem clima"}
                    </span>
                  </>
                )}
              </span>
              <span className="tabular-nums">
                <b>{formatClock(player.time)}</b> <span className="text-muted-foreground">/ {formatClock(duration)}</span>
              </span>
            </div>
          </div>
        )}
      </section>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conferência</h2>
          <ul className="flex flex-col gap-3">
            {checks.map((c, i) => (
              <li key={c.label} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={
                    c.ok
                      ? "flex h-6 w-6 flex-none items-center justify-center rounded-full bg-green-800 text-white"
                      : "flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground"
                  }
                >
                  {c.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={c.ok ? "" : "text-muted-foreground"}>
                  {c.label}
                  <span className="sr-only">{c.ok ? " (feito)" : " (falta)"}</span>
                  {!c.ok && c.optional && <span className="text-[13px]"> · recomendado</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Letra para o Holyrics</h2>
          <pre
            aria-label="Letra para o Holyrics"
            tabIndex={0}
            className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-[13px] leading-relaxed"
          >
            {text}
          </pre>
          <Button variant="outline" className="gap-2 self-start" disabled={!text} onClick={() => void copy()}>
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          <p className="text-[13px] text-muted-foreground">
            No Holyrics: Música nova, colar a letra. Cada bloco vira um slide e as linhas com <code>//</code> aparecem só
            para a banda.
          </p>
        </section>
      </div>
    </div>
  );
}
