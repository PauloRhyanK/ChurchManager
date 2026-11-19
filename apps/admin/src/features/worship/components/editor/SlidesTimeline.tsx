import { useEffect, useRef, useState } from "react";
import type { DerivedPart, DerivedSlide } from "../../lib/document";
import { formatClockTenths } from "../../lib/format";
import { PART_TONE } from "../../lib/part-colors";
import { moveSlideStart, projectedSlideIndex, type Times } from "../../lib/timing";

interface SlidesTimelineProps {
  slides: DerivedSlide[];
  parts: DerivedPart[];
  duration: number | null;
  /** Segundo atual do áudio. */
  time: number;
  /** Antecipação da projeção, em segundos. */
  lead: number;
  selectedId: string | null;
  canEdit: boolean;
  onSeek: (time: number) => void;
  onSelect: (slide: DerivedSlide) => void;
  /** Novo começo do slide `index` (arrastando a borda ou pelo teclado). */
  onMoveStart: (index: number, time: number, how: "DRAG" | "NUDGE") => void;
}

/** Largura mínima de cada slide na faixa, para dar para pegar a borda. */
const MIN_SLIDE_PX = 56;

/**
 * Os slides na linha do tempo do áudio: cada um é um bloco do começo ao fim,
 * com a cor da parte. A borda entre dois slides arrasta (ou vai pelas setas)
 * e muda onde um termina e o outro começa. O destacado é o que está na tela
 * naquele instante, já com a antecipação, como na projeção.
 */
export function SlidesTimeline({
  slides,
  parts,
  duration,
  time,
  lead,
  selectedId,
  canEdit,
  onSeek,
  onSelect,
  onMoveStart,
}: SlidesTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ index: number; time: number } | null>(null);

  // Enquanto toca, a faixa acompanha o cursor.
  useEffect(() => {
    const box = scrollRef.current;
    const track = trackRef.current;
    if (!box || !track || !duration) return;
    const x = (time / duration) * track.offsetWidth;
    if (x < box.scrollLeft + 24 || x > box.scrollLeft + box.clientWidth - 24) box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
  }, [time, duration]);

  if (!duration) {
    return <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">Carregando o áudio para desenhar a linha do tempo…</p>;
  }

  const base: Times = slides.map((s) => s.time);
  const times = drag ? moveSlideStart(base, drag.index, drag.time, duration) : base;
  const shown = slides.map((s, i) => ({ ...s, time: times[i] }));
  const onScreen = projectedSlideIndex(shown, time, lead);
  const timed = shown.filter((s) => s.time !== null);
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const timeAt = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const box = track.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - box.left) / box.width) * duration));
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>, index: number) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    try {
      // Continua recebendo o movimento mesmo fora da borda.
      target.setPointerCapture(event.pointerId);
    } catch {
      // ponteiro que já não existe: segue sem captura
    }
    let last = slides[index].time ?? 0;
    const move = (e: PointerEvent) => {
      last = timeAt(e.clientX);
      setDrag({ index, time: last });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancel);
      setDrag(null);
      if (last !== slides[index].time) onMoveStart(index, last, "DRAG");
    };
    const cancel = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancel);
      setDrag(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", cancel);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div
          ref={trackRef}
          className="relative h-[76px] cursor-pointer select-none rounded-lg bg-muted"
          style={{ minWidth: `max(100%, ${slides.length * MIN_SLIDE_PX}px)` }}
          onClick={(e) => onSeek(timeAt(e.clientX))}
        >
          {timed.map((s) => {
            const next = timed.find((o) => o.index > s.index);
            const start = s.time as number;
            const end = Math.max(start, next?.time ?? duration);
            const part = parts[s.part];
            const tone = PART_TONE[part?.kind ?? "VERSE"];
            const firstOfPart = part?.firstSlide === s.index;
            const live = s.index === onScreen;
            const selected = s.rowId === selectedId;
            return (
              <button
                key={s.rowId}
                type="button"
                data-slide-block={s.index + 1}
                aria-label={`Slide ${s.index + 1}, ${part?.name ?? ""}: de ${formatClockTenths(start)} a ${formatClockTenths(end)}${live ? ", na tela agora" : ""}`}
                aria-current={live ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(slides[s.index]);
                }}
                className={`absolute inset-y-1 flex flex-col items-start overflow-hidden rounded-md py-1 pl-2.5 pr-1.5 text-left text-[11px] leading-tight ${tone.block} ${
                  live ? "z-[1] ring-2 ring-primary ring-offset-1 ring-offset-muted" : ""
                } ${selected ? "outline outline-2 outline-foreground/60" : ""}`}
                style={{ left: pct(start), width: pct(end - start) }}
              >
                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${tone.bar}`} />
                <span className={`flex w-full items-center gap-1 font-bold ${tone.label}`}>
                  <span className="tabular-nums">{s.index + 1}</span>
                  {firstOfPart && <span className="truncate uppercase tracking-wide">{part?.name}</span>}
                </span>
                <span className="w-full truncate text-foreground/80">{s.lines[0] ?? s.cues[0]?.text ?? ""}</span>
              </button>
            );
          })}
          {canEdit &&
            timed.map((s) => {
              const index = s.index;
              const value = s.time as number;
              const nudge = (delta: number) => {
                const next = moveSlideStart(base, index, (base[index] ?? value) + delta, duration)[index];
                if (next !== null && next !== base[index]) onMoveStart(index, next, "NUDGE");
              };
              return (
                <span
                  key={`borda-${s.rowId}`}
                  role="slider"
                  tabIndex={0}
                  aria-label={`Começo do slide ${index + 1}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration * 10) / 10}
                  aria-valuenow={value}
                  aria-valuetext={formatClockTenths(value)}
                  title={`Arraste para mudar onde o slide ${index + 1} começa (setas: 0,1 s; com Shift: 0,5 s)`}
                  data-slide-edge={index + 1}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => startDrag(e, index)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const step = e.shiftKey ? 0.5 : 0.1;
                    nudge(e.key === "ArrowLeft" ? -step : step);
                  }}
                  className="group absolute inset-y-0 z-[2] -ml-[7px] flex w-[14px] cursor-col-resize justify-center outline-none"
                  style={{ left: pct(value) }}
                >
                  <span
                    className={`h-full w-[3px] rounded-full ${
                      drag?.index === index ? "bg-primary" : "bg-foreground/25 group-hover:bg-primary group-focus-visible:bg-primary"
                    }`}
                  />
                  {drag?.index === index && (
                    <span className="absolute bottom-1 left-2.5 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-background">
                      {formatClockTenths(value)}
                    </span>
                  )}
                </span>
              );
            })}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 bg-foreground" style={{ left: pct(Math.min(time, duration)) }} />
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Cada bloco é um slide, do começo ao fim. Arraste a borda entre dois slides para mudar onde um termina e o outro
        começa; com a borda selecionada, as setas mudam 0,1 s (com Shift, 0,5 s). O contorno colorido marca o slide que
        está na tela agora, já com a antecipação.
      </p>
    </div>
  );
}
