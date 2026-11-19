import type { DerivedSlide, WorshipRow } from "./document";

export type SlideState = "NONE" | "OK" | "CHECK" | "AI";

const round = (t: number) => Math.max(0, Math.round(t * 100) / 100);

/** Grava o tempo do slide que começa na linha `rowId`. */
export function markSlide(rows: WorshipRow[], rowId: string, time: number): WorshipRow[] {
  return rows.map((r) => (r.id === rowId ? { ...r, time: round(time), timeSource: "MANUAL" as const } : r));
}

/** Adianta ou atrasa o tempo já marcado (ex.: -0,1 s). Sem tempo, não faz nada. */
export function nudgeSlide(rows: WorshipRow[], rowId: string, delta: number): WorshipRow[] {
  return rows.map((r) =>
    r.id === rowId && typeof r.time === "number"
      ? { ...r, time: round(r.time + delta), timeSource: "MANUAL" as const }
      : r,
  );
}

/** Sem tempo, Certo, Conferir (fora de ordem ou depois do fim do áudio) ou IA (sugerido, ainda não conferido). */
export function slideStates(slides: DerivedSlide[], duration: number | null): SlideState[] {
  let previous = -1;
  return slides.map((s) => {
    if (s.time === null) return "NONE";
    const wrong = s.time <= previous || (duration !== null && s.time > duration);
    previous = Math.max(previous, s.time);
    if (wrong) return "CHECK";
    return s.timeSource === "AI" ? "AI" : "OK";
  });
}

/** O slide que está no ar no segundo `t`: o último, na ordem, cujo tempo já passou. */
export function currentSlideIndex(slides: DerivedSlide[], t: number): number {
  let current = -1;
  for (const s of slides) {
    if (s.time !== null && s.time <= t) current = s.index;
  }
  return current;
}

/** Menor distância entre dois slides seguidos. */
export const MIN_SLIDE_GAP = 0.1;
/** Antecipação: o slide entra este tanto antes do início da frase. */
export const LEAD_LIMITS = { min: 0, max: 1.5, step: 0.1, default: 0.3 } as const;

export type Times = (number | null)[];

/** Os tempos marcados, um por slide, na ordem. */
export const timesOf = (slides: DerivedSlide[]): Times => slides.map((s) => s.time);

/** Grava um tempo por slide (null apaga). `source` diz de onde veio. */
export function applyTimes(rows: WorshipRow[], slides: DerivedSlide[], times: Times, source: "MANUAL" | "AI" = "MANUAL"): WorshipRow[] {
  const byRow = new Map(slides.map((s, i) => [s.rowId, times[i] ?? null]));
  return rows.map((r) => {
    if (!byRow.has(r.id)) return r;
    const t = byRow.get(r.id) ?? null;
    if (t === null) {
      const { time: _time, timeSource: _source, ...rest } = r;
      return rest;
    }
    return { ...r, time: round(t), timeSource: source };
  });
}

const clamp = (t: number, duration: number | null) => Math.max(0, duration !== null ? Math.min(t, duration) : t);

/**
 * Desloca a marcação inteira em slides. `-1` ("voltar um slide"): cada slide
 * passa a entrar no tempo do anterior, e o primeiro ganha um tempo estimado
 * antes (com a duração do slide seguinte). É o conserto de quem marcou no fim
 * da frase em vez do começo. `+1` é o contrário.
 */
export function shiftBySlides(times: Times, direction: -1 | 1, duration: number | null): Times {
  const n = times.length;
  if (n < 2) return times;
  if (direction === -1) {
    const first = times[0];
    const second = times[1];
    const estimate = first !== null && second !== null ? round(Math.max(0, first - (second - first))) : first === null ? null : 0;
    return [estimate, ...times.slice(0, n - 1)];
  }
  const last = times[n - 1];
  const before = times[n - 2];
  const estimate =
    last !== null && before !== null ? round(clamp(last + (last - before), duration)) : last;
  return [...times.slice(1), estimate];
}

/** Move todos os tempos marcados `delta` segundos (dentro do áudio). */
export function shiftBySeconds(times: Times, delta: number, duration: number | null): Times {
  return times.map((t) => (t === null ? null : round(clamp(t + delta, duration))));
}

/**
 * Leva o começo do slide `index` para `time`, sem passar dos vizinhos: fica
 * pelo menos `MIN_SLIDE_GAP` depois do anterior e antes do seguinte.
 */
export function moveSlideStart(times: Times, index: number, time: number, duration: number | null): Times {
  if (times[index] === null || times[index] === undefined) return times;
  let low = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (times[i] !== null) {
      low = (times[i] as number) + MIN_SLIDE_GAP;
      break;
    }
  }
  let high = duration ?? Infinity;
  for (let i = index + 1; i < times.length; i++) {
    if (times[i] !== null) {
      high = (times[i] as number) - MIN_SLIDE_GAP;
      break;
    }
  }
  if (high < low) return times;
  const next = [...times];
  next[index] = round(Math.min(high, Math.max(low, time)));
  return next;
}

/** O slide que está na tela no segundo `t` da música, já com a antecipação (como na projeção). */
export function projectedSlideIndex(slides: DerivedSlide[], t: number, lead: number): number {
  return currentSlideIndex(slides, t + lead);
}

/** Quantos slides mudaram de tempo entre duas marcações. */
export const changedCount = (a: Times, b: Times) => a.filter((t, i) => (t ?? null) !== (b[i] ?? null)).length;
