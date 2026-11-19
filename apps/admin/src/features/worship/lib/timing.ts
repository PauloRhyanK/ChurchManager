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
