import { Check, Music, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Song } from "../../api/worship-api";
import { deriveSong, type DerivedSlide, type WorshipRow } from "../../lib/document";
import { formatClock, formatClockTenths } from "../../lib/format";
import { revealInside } from "../../lib/scroll";
import { currentSlideIndex, markSlide, nudgeSlide, slideStates, type SlideState } from "../../lib/timing";
import { AudioCard } from "./AudioCard";
import { PartsTimeline } from "./PartsTimeline";
import { usePlayer } from "./usePlayer";

interface TimingStepProps {
  song: Song;
  rows: WorshipRow[];
  canEdit: boolean;
  onChange: (rows: WorshipRow[]) => void;
  onAudioUploaded: (song: Song) => void;
}

const STATE_META: Record<SlideState, { label: string; className: string }> = {
  NONE: { label: "Sem tempo", className: "text-muted-foreground" },
  OK: { label: "Certo", className: "text-green-800" },
  CHECK: { label: "Conferir", className: "text-amber-800" },
  AI: { label: "IA", className: "text-muted-foreground" },
};

const slideTitle = (s: DerivedSlide) => s.lines[0] ?? (s.cues[0] ? `(${s.cues[0].text})` : "(sem letra)");

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function TimingStep({ song, rows, canEdit, onChange, onAudioUploaded }: TimingStepProps) {
  const { parts, slides } = useMemo(() => deriveSong(rows), [rows]);
  const player = usePlayer(song.audio?.url ?? null);
  const duration = player.duration ?? song.audio?.durationSeconds ?? null;
  const states = useMemo(() => slideStates(slides, duration), [slides, duration]);
  const allTimed = slides.length > 0 && slides.every((s) => s.time !== null);

  const [selectedId, setSelectedId] = useState<string | null>(
    () => (slides.find((s) => s.time === null) ?? slides[0])?.rowId ?? null,
  );
  // Com tudo marcado, Espaço toca e pausa; só remarca o slide em que a pessoa clicou.
  const [picked, setPicked] = useState(false);
  const selected = slides.find((s) => s.rowId === selectedId) ?? slides[0] ?? null;
  const next = selected ? slides[selected.index + 1] : undefined;
  const listRef = useRef<HTMLOListElement>(null);
  const selectedRowId = selected?.rowId;
  // Acompanha o slide selecionado só dentro da lista, sem rolar a página.
  useEffect(() => {
    if (!selectedRowId) return;
    revealInside(listRef.current, listRef.current?.querySelector<HTMLElement>(`[data-slide-row="${selectedRowId}"]`));
  }, [selectedRowId]);

  // Com tudo marcado, a seleção acompanha o áudio: é a conferência.
  const playingIndex = currentSlideIndex(slides, player.time);
  useEffect(() => {
    if (allTimed && !picked && player.playing && playingIndex >= 0) setSelectedId(slides[playingIndex].rowId);
  }, [allTimed, picked, player.playing, playingIndex, slides]);

  const mark = () => {
    if (!canEdit || !selected || !song.audio) return;
    onChange(markSlide(rows, selected.rowId, player.now()));
    setPicked(false);
    if (next && !allTimed) setSelectedId(next.rowId);
  };
  /** O que a barra de espaço faz: marcar enquanto falta tempo (ou num slide escolhido); depois, tocar e pausar. */
  const onSpace = () => {
    if (canEdit && (!allTimed || picked)) mark();
    else player.toggle();
  };
  const markRef = useRef(onSpace);
  markRef.current = onSpace;

  // Barra de espaço marca, em qualquer lugar da tela que não seja um campo de texto.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target) || e.repeat) return;
      e.preventDefault();
      markRef.current();
    };
    // Sem isto, o espaço solto em cima de um botão focado ainda o "clicaria".
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (!song.audio) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-8">
        <div>
          <h2 className="text-lg font-bold">Falta o áudio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O tempo de cada slide é marcado ouvindo o áudio-guia (o VS com click, ou a gravação de referência). É ele
            que vai tocar no culto, então é contra ele que a letra é marcada.
          </p>
        </div>
        <AudioCard song={song} canEdit={canEdit} onUploaded={onAudioUploaded} />
      </div>
    );
  }

  const toCheck = states.filter((s) => s === "CHECK").length;
  const missing = states.filter((s) => s === "NONE").length;
  const summary = [toCheck ? `${toCheck} para conferir` : null, missing ? `${missing} sem tempo` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Tocador" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Music className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
            <b className="truncate">{song.audio.fileName ?? "Áudio-guia"}</b>
            <span className="text-muted-foreground">{formatClock(duration)}</span>
          </span>
          <div className="w-full max-w-xs">
            <AudioCard song={song} canEdit={canEdit} onUploaded={onAudioUploaded} />
          </div>
        </div>
        {player.failed && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            Não foi possível tocar o áudio. Tente enviar o arquivo de novo.
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label={player.playing ? "Pausar" : "Tocar"}
            onClick={player.toggle}
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {player.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <PartsTimeline
              parts={parts}
              duration={duration}
              time={player.time}
              onSeek={player.seek}
              colorOf={(p) =>
                p.index % 2 === 0
                  ? { background: "#D9D3F3", color: "#2C1D6B" }
                  : { background: "#C4BBEC", color: "#2C1D6B" }
              }
            />
          </div>
          <span className="flex-none tabular-nums">
            <b>{formatClock(player.time)}</b> <span className="text-muted-foreground">/ {formatClock(duration)}</span>
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-5 rounded-xl border bg-card p-6">
          {selected ? (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {selected.index + 1} · {parts[selected.part]?.name}
              </span>
              <span className="min-h-[72px] whitespace-pre-line text-2xl font-bold leading-tight">
                {selected.lines.length ? selected.lines.join("\n") : slideTitle(selected)}
              </span>
              <span className="text-sm text-muted-foreground">
                {next ? `A seguir: ${slideTitle(next)}` : "É o último slide"}
              </span>
              <span className="text-sm tabular-nums">
                Entra em <b>{formatClockTenths(selected.time)}</b>
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">A música ainda não tem slides. Volte ao passo 1.</p>
          )}
          {canEdit && selected && (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-12 gap-3 px-5 text-base" onClick={mark}>
                Marcar aqui
                <span className="rounded border border-primary-foreground/40 px-1.5 py-0.5 text-xs font-medium">Espaço</span>
              </Button>
              <Button
                variant="outline"
                className="h-12 tabular-nums"
                aria-label="Adiantar um décimo de segundo"
                disabled={selected.time === null}
                onClick={() => onChange(nudgeSlide(rows, selected.rowId, -0.1))}
              >
                −0,1
              </Button>
              <Button
                variant="outline"
                className="h-12 tabular-nums"
                aria-label="Atrasar um décimo de segundo"
                disabled={selected.time === null}
                onClick={() => onChange(nudgeSlide(rows, selected.rowId, 0.1))}
              >
                +0,1
              </Button>
              <Button variant="outline" className="h-12 gap-2" aria-label="Voltar 5 segundos" onClick={() => player.seek(player.now() - 5)}>
                <RotateCcw className="h-4 w-4" />5 s
              </Button>
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">
            {allTimed
              ? "Todos os slides têm tempo: agora Espaço toca e pausa. Para remarcar um, clique nele na lista e use Marcar aqui."
              : "Toque o áudio e aperte Espaço no instante em que cada slide deve entrar. Clique num slide da lista para voltar a ele."}
          </p>
        </section>

        <section className="min-w-0 flex-[1.4_1_460px] overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b py-2.5 pl-5 pr-3">
            <span>
              <b>
                {slides.length} {slides.length === 1 ? "slide" : "slides"}
              </b>
              {summary && <span className="text-muted-foreground"> · {summary}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" disabled title="Sugestão automática de tempo: em breve">
                <Sparkles className="h-4 w-4" />
                Sugerir os tempos · em breve
              </Button>
              <Button variant="outline" size="sm" className="gap-2" disabled title="Aprova os tempos sugeridos. Em breve.">
                <Check className="h-4 w-4" />
                Aprovar
              </Button>
            </span>
          </div>
          <ol ref={listRef} className="max-h-[520px] overflow-y-auto">
            {slides.map((s, i) => {
              const isSelected = selected?.rowId === s.rowId;
              const state = STATE_META[states[i]];
              return (
                <li key={s.rowId} className={i === 0 ? "" : "border-t"}>
                  <button
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    data-slide-row={s.rowId}
                    onClick={() => {
                      setSelectedId(s.rowId);
                      setPicked(true);
                      if (s.time !== null) player.seek(s.time);
                    }}
                    className={`flex w-full items-center gap-3 border-l-4 px-4 py-2.5 text-left ${
                      isSelected
                        ? "border-l-primary bg-primary/10"
                        : states[i] === "CHECK"
                          ? "border-l-amber-500 bg-amber-50"
                          : "border-l-transparent hover:bg-accent/40"
                    }`}
                  >
                    <span className="w-6 flex-none text-right text-[13px] tabular-nums text-muted-foreground">{s.index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{slideTitle(s)}</span>
                    <span className={`flex-none text-[13px] font-semibold ${state.className}`}>{state.label}</span>
                    <span className="w-14 flex-none text-right tabular-nums">{formatClockTenths(s.time)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
