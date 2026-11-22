import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Monitor,
  Music,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import {
  fetchLearnedTiming,
  fetchTimingSettings,
  recordTimingCorrection,
  saveTimingSettings,
  type Song,
  type TimingCorrectionSource,
} from "../../api/worship-api";
import { deriveSong, type DerivedSlide, type WorshipRow } from "../../lib/document";
import { formatClock, formatClockTenths } from "../../lib/format";
import { revealInside } from "../../lib/scroll";
import {
  LEAD_LIMITS,
  applyTimes,
  changedCount,
  markSlide,
  moveSlideStart,
  projectedSlideIndex,
  shiftBySeconds,
  shiftBySlides,
  slideStates,
  timesOf,
  type SlideState,
  type Times,
} from "../../lib/timing";
import { AudioCard } from "./AudioCard";
import { SlidesTimeline } from "./SlidesTimeline";
import { TimingAiPanel } from "./TimingAiPanel";
import { TimingBulkPanel } from "./TimingBulkPanel";
import { usePlayer } from "./usePlayer";

interface TimingStepProps {
  song: Song;
  rows: WorshipRow[];
  canEdit: boolean;
  onChange: (rows: WorshipRow[]) => void;
  onAudioUploaded: (song: Song) => void;
  /** Salva agora o que estiver pendente (antes de pedir à IA). */
  saveNow: () => Promise<boolean>;
}

const STATE_META: Record<SlideState, { label: string; className: string }> = {
  NONE: { label: "Sem tempo", className: "text-muted-foreground" },
  OK: { label: "Certo", className: "text-green-800 dark:text-green-400" },
  CHECK: { label: "Conferir", className: "text-amber-800 dark:text-amber-300" },
  AI: { label: "IA", className: "text-muted-foreground" },
};

const FINE_STEPS = [-0.5, -0.1, 0.1, 0.5];

const slideTitle = (s: DerivedSlide) => s.lines[0] ?? (s.cues[0] ? `(${s.cues[0].text})` : "(sem letra)");
const fmtStep = (d: number) => `${d < 0 ? "−" : "+"}${Math.abs(d).toLocaleString("pt-BR")}`;

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable ||
      el.getAttribute("role") === "slider")
  );
};

export function TimingStep({ song, rows, canEdit, onChange, onAudioUploaded, saveNow }: TimingStepProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"presenter" | "advanced">("presenter");
  const { parts, slides } = useMemo(() => deriveSong(rows), [rows]);
  const player = usePlayer(song.audio?.url ?? null);
  const duration = player.duration ?? song.audio?.durationSeconds ?? null;
  const states = useMemo(() => slideStates(slides, duration), [slides, duration]);
  const allTimed = slides.length > 0 && slides.every((s) => s.time !== null);
  const hasTimes = slides.some((s) => s.time !== null);
  const timedCount = slides.filter((s) => s.time !== null).length;

  const settingsQuery = useQuery({ queryKey: ["worship", "timing", "settings"], queryFn: fetchTimingSettings });
  const learnedQuery = useQuery({ queryKey: ["worship", "timing", "learned"], queryFn: fetchLearnedTiming, enabled: canEdit });
  const lead = settingsQuery.data?.slideLeadSeconds ?? LEAD_LIMITS.default;
  const saveLead = useMutation({
    mutationFn: saveTimingSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(["worship", "timing", "settings"], saved);
      toast.success("Antecipação salva. Vale para todas as músicas.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    () => (slides.find((s) => s.time === null) ?? slides[0])?.rowId ?? null,
  );
  // Com tudo marcado, Espaço toca e pausa; só remarca o slide em que a pessoa clicou.
  const [picked, setPicked] = useState(false);
  const selected = slides.find((s) => s.rowId === selectedId) ?? slides[0] ?? null;
  const next = selected ? slides[selected.index + 1] : undefined;
  const listRef = useRef<HTMLOListElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const selectedRowId = selected?.rowId;

  // Acompanha o slide selecionado só dentro da lista, sem rolar a página.
  useEffect(() => {
    if (!selectedRowId) return;
    if (mode === "advanced") {
      revealInside(listRef.current, listRef.current?.querySelector<HTMLElement>(`[data-slide-row="${selectedRowId}"]`));
    } else {
      revealInside(carouselRef.current, carouselRef.current?.querySelector<HTMLElement>(`[data-carousel-slide="${selectedRowId}"]`));
    }
  }, [selectedRowId, mode]);

  // O slide que está na tela agora, como na projeção (com a antecipação).
  const onScreenIndex = projectedSlideIndex(slides, player.time, lead);

  // Com tudo marcado, a seleção acompanha o áudio: é a conferência.
  useEffect(() => {
    if (allTimed && !picked && player.playing && onScreenIndex >= 0) setSelectedId(slides[onScreenIndex].rowId);
  }, [allTimed, picked, player.playing, onScreenIndex, slides]);

  /** Grava uma correção nos tempos e guarda o antes e depois para o aprendizado. */
  const commit = (after: Times, source: TimingCorrectionSource, extra: { instruction?: string; message?: string } = {}) => {
    const before = timesOf(slides);
    if (!canEdit || changedCount(before, after) === 0) return;
    const previous = rows;
    onChange(applyTimes(rows, slides, after));
    recordTimingCorrection(song.id, { source, before, after, instruction: extra.instruction })
      .then(() => queryClient.invalidateQueries({ queryKey: ["worship", "timing", "learned"] }))
      .catch(() => undefined);
    if (extra.message) toast.success(extra.message, { action: { label: "Desfazer", onClick: () => onChange(previous) } });
  };

  const mark = () => {
    if (!canEdit || !selected || !song.audio) return;
    onChange(markSlide(rows, selected.rowId, player.now()));
    setPicked(false);
    if (next && !allTimed) setSelectedId(next.rowId);
  };

  // Determinação dos slides no Modo Passador
  const nextSlideToCut = useMemo(() => {
    if (picked && selected) return selected;
    if (!allTimed) return slides.find((s) => s.time === null) ?? null;
    return onScreenIndex >= 0 && onScreenIndex + 1 < slides.length ? slides[onScreenIndex + 1] : null;
  }, [picked, selected, allTimed, slides, onScreenIndex]);

  const currentSlideOnScreen = useMemo(() => {
    if (picked && selected) {
      return selected.index > 0 ? slides[selected.index - 1] : null;
    }
    if (!allTimed) {
      const firstUntimed = slides.find((s) => s.time === null);
      if (!firstUntimed) return null;
      return firstUntimed.index > 0 ? slides[firstUntimed.index - 1] : null;
    }
    return onScreenIndex >= 0 ? slides[onScreenIndex] : slides[0] ?? null;
  }, [picked, selected, allTimed, slides, onScreenIndex]);

  const handlePresenterCut = () => {
    if (!canEdit || !song.audio) return;
    if (nextSlideToCut) {
      onChange(markSlide(rows, nextSlideToCut.rowId, player.now()));
      setPicked(false);
      if (!player.playing) player.toggle();
      const following = slides[nextSlideToCut.index + 1];
      if (following) setSelectedId(following.rowId);
    } else if (allTimed) {
      player.toggle();
    }
  };

  const handleUndoLastCut = () => {
    if (!canEdit) return;
    const lastTimed = [...slides].reverse().find((s) => s.time !== null);
    if (!lastTimed) return;
    const newTimes = timesOf(slides);
    newTimes[lastTimed.index] = null;
    onChange(applyTimes(rows, slides, newTimes));
    setSelectedId(lastTimed.rowId);
    setPicked(true);
    const prevTime = lastTimed.index > 0 ? (slides[lastTimed.index - 1]?.time ?? 0) : 0;
    player.seek(Math.max(0, prevTime));
    toast.info(`Corte do slide ${lastTimed.index + 1} desfeito.`);
  };

  /** O que a barra de espaço faz: cortar ou tocar/pausar. */
  const onSpace = () => {
    if (mode === "presenter") {
      if (canEdit && (!allTimed || picked)) {
        handlePresenterCut();
      } else {
        player.toggle();
      }
    } else {
      if (canEdit && (!allTimed || picked)) mark();
      else player.toggle();
    }
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
  const marking = canEdit && (!allTimed || picked);
  const selectSlide = (s: DerivedSlide) => {
    setSelectedId(s.rowId);
    setPicked(true);
    if (s.time !== null) player.seek(Math.max(0, s.time - lead - 1));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Barra de controle de áudio e alternância de modo */}
      <section aria-label="Tocador" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Music className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
            <b className="truncate">{song.audio.fileName ?? "Áudio-guia"}</b>
            <span className="text-muted-foreground">{formatClock(duration)}</span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant={mode === "presenter" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setMode("presenter")}
              className="gap-1.5"
            >
              <Presentation className="h-4 w-4" />
              Modo Passador
            </Button>
            <Button
              variant={mode === "advanced" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setMode("advanced")}
              className="gap-1.5"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Ajuste Fino & Linha do Tempo
            </Button>
          </div>
        </div>

        {player.failed && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            Não foi possível tocar o áudio. Tente enviar o arquivo de novo.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={player.playing ? "Pausar" : "Tocar"}
              onClick={player.toggle}
              className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {player.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <span className="tabular-nums">
              <b className="text-base">{formatClock(player.time)}</b>{" "}
              <span className="text-muted-foreground">/ {formatClock(duration)}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Voltar 5 segundos"
              onClick={() => player.seek(Math.max(0, player.now() - 5))}
              className="gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 5s
            </Button>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
              {timedCount} de {slides.length} slides marcados
            </span>
          </div>
        </div>

        {mode === "advanced" && (
          <SlidesTimeline
            slides={slides}
            parts={parts}
            duration={duration}
            time={player.time}
            lead={lead}
            selectedId={selected?.rowId ?? null}
            canEdit={canEdit}
            onSeek={player.seek}
            onSelect={selectSlide}
            onMoveStart={(index, time, how) => commit(moveSlideStart(timesOf(slides), index, time, duration), how)}
          />
        )}
      </section>

      {/* MODO PASSADOR DE SLIDES (CORTE EM TEMPO REAL) */}
      {mode === "presenter" && (
        <div className="flex flex-col gap-6">
          {/* Palco dos dois slides: Atual (No Telão) e Próximo (A Seguir) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1: Slide Atual (No telão) */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#06080F] p-6 text-slate-100 shadow-xl min-h-[260px] relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded bg-red-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-red-400 border border-red-500/30">
                    <Monitor className="h-3 w-3" /> No Telão
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {currentSlideOnScreen ? parts[currentSlideOnScreen.part]?.name : "Início"}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {currentSlideOnScreen ? `Slide ${currentSlideOnScreen.index + 1} de ${slides.length}` : `Slide 0 de ${slides.length}`}
                </span>
              </div>

              <div className="my-auto py-6 text-center">
                {currentSlideOnScreen ? (
                  <p className="whitespace-pre-line text-xl sm:text-2xl font-bold tracking-tight leading-relaxed text-slate-50">
                    {currentSlideOnScreen.lines.length ? currentSlideOnScreen.lines.join("\n") : slideTitle(currentSlideOnScreen)}
                  </p>
                ) : (
                  <p className="text-base text-slate-500 italic">
                    (Aguardando início do louvor. Dê o primeiro corte quando a banda começar.)
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400 tabular-nums">
                <span>
                  {currentSlideOnScreen && currentSlideOnScreen.time !== null
                    ? `Marcado em ${formatClockTenths(currentSlideOnScreen.time)}`
                    : "Sem corte gravado"}
                </span>
                <span>Antecipação: -{lead.toLocaleString("pt-BR")}s</span>
              </div>
            </div>

            {/* Card 2: Próximo Slide (A seguir / Cortar aqui) */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-primary/60 bg-card p-6 shadow-lg min-h-[260px] relative">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary border border-primary/20">
                    <ChevronRight className="h-3.5 w-3.5" /> Próximo Slide
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {nextSlideToCut ? parts[nextSlideToCut.part]?.name : "Fim"}
                  </span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {nextSlideToCut ? `Slide ${nextSlideToCut.index + 1} de ${slides.length}` : "Último slide já exibido"}
                </span>
              </div>

              <div className="my-auto py-6 text-center">
                {nextSlideToCut ? (
                  <p className="whitespace-pre-line text-xl sm:text-2xl font-semibold tracking-tight leading-relaxed text-foreground">
                    {nextSlideToCut.lines.length ? nextSlideToCut.lines.join("\n") : slideTitle(nextSlideToCut)}
                  </p>
                ) : (
                  <p className="text-base text-muted-foreground italic">
                    Parabéns! Todos os slides foram cortados.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span className="font-medium text-primary">
                  {nextSlideToCut ? "Aperte Espaço quando esta frase começar" : "Todos marcados"}
                </span>
                <span className="tabular-nums">
                  {nextSlideToCut?.time !== null && nextSlideToCut?.time !== undefined
                    ? `Tempo atual: ${formatClockTenths(nextSlideToCut.time)}`
                    : "Sem tempo ainda"}
                </span>
              </div>
            </div>
          </div>

          {/* Barra de Ações: Botão principal de Corte e Atalhos */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              {canEdit && (
                <Button
                  size="lg"
                  onClick={handlePresenterCut}
                  className="h-14 gap-3 px-6 text-base font-semibold shadow-md"
                >
                  <Scissors className="h-5 w-5" />
                  {allTimed && !picked ? "Tocar / Pausar" : "Cortar / Passar Slide"}
                  <kbd className="rounded border border-primary-foreground/40 bg-primary-foreground/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
                    Espaço
                  </kbd>
                </Button>
              )}

              <Button
                variant="outline"
                size="lg"
                onClick={() => player.seek(Math.max(0, player.now() - 5))}
                className="h-14 gap-2"
                aria-label="Voltar 5 segundos"
              >
                <RotateCcw className="h-4 w-4" />
                Voltar 5s
              </Button>

              {canEdit && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleUndoLastCut}
                  disabled={!hasTimes}
                  className="h-14 gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Undo2 className="h-4 w-4" />
                  Desfazer corte
                </Button>
              )}
            </div>

            {/* Ajuste fino rápido do slide atual */}
            {canEdit && currentSlideOnScreen && currentSlideOnScreen.time !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Ajustar slide atual:</span>
                {FINE_STEPS.map((d) => (
                  <Button
                    key={d}
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2.5 text-xs tabular-nums"
                    onClick={() =>
                      commit(
                        moveSlideStart(timesOf(slides), currentSlideOnScreen.index, (currentSlideOnScreen.time ?? 0) + d, duration),
                        "NUDGE",
                      )
                    }
                  >
                    {fmtStep(d)}s
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Fita / Carrossel Horizontal de Todos os Slides */}
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">Sequência de slides</span>
              <span>Clique em qualquer slide para pular o áudio e remarcar</span>
            </div>
            <div ref={carouselRef} className="flex gap-2.5 overflow-x-auto pb-2 pt-1">
              {slides.map((s) => {
                const isCurrent = currentSlideOnScreen?.rowId === s.rowId;
                const isNext = nextSlideToCut?.rowId === s.rowId;
                const isTimed = s.time !== null;

                return (
                  <button
                    key={s.rowId}
                    type="button"
                    data-carousel-slide={s.rowId}
                    onClick={() => selectSlide(s)}
                    className={`flex h-20 w-44 flex-none flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
                      isNext
                        ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/40"
                        : isCurrent
                          ? "border-slate-800 bg-[#06080F] text-slate-100"
                          : isTimed
                            ? "border-border/80 bg-card hover:border-primary/50"
                            : "border-dashed border-muted text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold">#{s.index + 1}</span>
                      <span className="truncate font-medium opacity-80">{parts[s.part]?.name}</span>
                    </div>
                    <span className="truncate text-xs font-semibold leading-snug">
                      {slideTitle(s)}
                    </span>
                    <div className="flex items-center justify-between text-[11px] tabular-nums">
                      <span>{s.time !== null ? formatClockTenths(s.time) : "--:--"}</span>
                      {isCurrent && <span className="font-bold text-red-500">NO AR</span>}
                      {isNext && <span className="font-bold text-primary">A SEGUIR</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODO AVANÇADO (TIMELINE, TABELA E AJUSTES FINOS) */}
      {mode === "advanced" && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
            <section aria-label="Marcar" className="flex flex-col gap-4 rounded-xl border bg-card p-6">
              {selected ? (
                <>
                  <div
                    className={`rounded-lg border-2 p-4 ${marking ? "border-primary bg-primary/5" : "border-transparent bg-muted/50"}`}
                    aria-live="polite"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      {marking ? `O próximo toque marca o slide ${selected.index + 1}` : `Slide ${selected.index + 1}`} ·{" "}
                      {parts[selected.part]?.name}
                    </span>
                    <span className="mt-1.5 block min-h-[64px] whitespace-pre-line text-2xl font-bold leading-tight">
                      {selected.lines.length ? selected.lines.join("\n") : slideTitle(selected)}
                    </span>
                    <span className="mt-2 block text-sm tabular-nums">
                      {selected.time === null ? (
                        "Ainda sem tempo."
                      ) : (
                        <>
                          Começa a ser cantada em <b>{formatClockTenths(selected.time)}</b> · aparece na tela em{" "}
                          {formatClockTenths(Math.max(0, selected.time - lead))}
                        </>
                      )}
                    </span>
                  </div>
                  {marking && (
                    <p className="text-[15px] leading-snug">
                      Aperte <b>Espaço</b> quando esta frase <b className="uppercase">começar</b> a ser cantada, e não
                      quando ela terminar. O slide aparece {lead.toLocaleString("pt-BR")} s antes, sozinho.
                    </p>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {next ? `Depois: ${slideTitle(next)}` : "É o último slide"}
                  </span>
                </>
              ) : (
                <p className="text-muted-foreground">A música ainda não tem slides. Volte ao passo 1.</p>
              )}
              {canEdit && selected && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className="h-12 gap-3 px-5 text-base" onClick={mark}>
                      Começou aqui
                      <span className="rounded border border-primary-foreground/40 px-1.5 py-0.5 text-xs font-medium">Espaço</span>
                    </Button>
                    <Button variant="outline" className="h-12 gap-2" aria-label="Voltar 5 segundos" onClick={() => player.seek(player.now() - 5)}>
                      <RotateCcw className="h-4 w-4" />5 s
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ajuste fino do slide selecionado">
                    <span className="mr-1 text-sm text-muted-foreground">Ajuste fino:</span>
                    {FINE_STEPS.map((d) => (
                      <Button
                        key={d}
                        variant="outline"
                        size="sm"
                        className="tabular-nums"
                        aria-label={`${d < 0 ? "Mais cedo" : "Mais tarde"} ${Math.abs(d).toLocaleString("pt-BR")} segundo`}
                        disabled={selected.time === null}
                        onClick={() =>
                          commit(moveSlideStart(timesOf(slides), selected.index, (selected.time ?? 0) + d, duration), "NUDGE")
                        }
                      >
                        {fmtStep(d)} s
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[13px] text-muted-foreground">
                {allTimed
                  ? "Todos os slides têm tempo: agora Espaço toca e pausa. Para remarcar um, clique nele (na lista ou na linha do tempo) e use Começou aqui."
                  : "Toque o áudio e aperte Espaço no instante em que cada frase começa a ser cantada. Clique num slide para voltar a ele."}
              </p>
            </section>

            <TimingBulkPanel
              canEdit={canEdit}
              lead={lead}
              savingLead={saveLead.isPending}
              onLeadCommit={(value) => saveLead.mutate(value)}
              learned={learnedQuery.data}
              hasTimes={hasTimes}
              onShiftSlides={(direction) =>
                commit(shiftBySlides(timesOf(slides), direction, duration), "SHIFT_SLIDES", {
                  message: direction < 0 ? "Todos os slides voltaram 1 slide (entram mais cedo)." : "Todos os slides foram atrasados 1 slide.",
                })
              }
              onShiftSeconds={(delta) =>
                commit(shiftBySeconds(timesOf(slides), delta, duration), "SHIFT_SECONDS", {
                  message: `Todos os slides foram ${delta < 0 ? "adiantados" : "atrasados"} ${Math.abs(delta).toLocaleString("pt-BR")} s.`,
                })
              }
            />

            {canEdit && (
              <TimingAiPanel
                songId={song.id}
                slides={slides}
                parts={parts}
                enabled={!!settingsQuery.data?.aiEnabled}
                saveNow={saveNow}
                onApply={(suggestion, instruction) =>
                  commit(suggestion.times, "INSTRUCTION", { instruction, message: "Sugestão da IA aplicada." })
                }
              />
            )}
          </div>

          <section className="min-w-0 flex-[1.4_1_460px] overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b py-2.5 pl-5 pr-3">
              <span>
                <b>
                  {slides.length} {slides.length === 1 ? "slide" : "slides"}
                </b>
                {summary && <span className="text-muted-foreground"> · {summary}</span>}
              </span>
              <span className="text-[13px] text-muted-foreground">Tempo = começo da frase</span>
            </div>
            <ol ref={listRef} className="max-h-[640px] overflow-y-auto">
              {slides.map((s, i) => {
                const isSelected = selected?.rowId === s.rowId;
                const live = i === onScreenIndex;
                const state = STATE_META[states[i]];
                return (
                  <li key={s.rowId} className={i === 0 ? "" : "border-t"}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      data-slide-row={s.rowId}
                      onClick={() => selectSlide(s)}
                      className={`flex w-full items-center gap-3 border-l-4 px-4 py-2.5 text-left ${
                        isSelected
                          ? "border-l-primary bg-primary/10"
                          : states[i] === "CHECK"
                            ? "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30"
                            : "border-l-transparent hover:bg-accent/40"
                      }`}
                    >
                      <span className="w-6 flex-none text-right text-[13px] tabular-nums text-muted-foreground">{s.index + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{slideTitle(s)}</span>
                      {live && <span className="flex-none rounded bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">NA TELA</span>}
                      <span className={`flex-none text-[13px] font-semibold ${state.className}`}>{state.label}</span>
                      <span className="w-14 flex-none text-right tabular-nums">{formatClockTenths(s.time)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
