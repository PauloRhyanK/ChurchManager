// Regras puras do alinhamento dos slides: o que se aceita de uma sugestão da IA
// e o que se aprende com as correções feitas à mão.

export const TIMING_SOURCES = ['DRAG', 'NUDGE', 'SHIFT_SECONDS', 'SHIFT_SLIDES', 'INSTRUCTION'] as const;
export type TimingSource = (typeof TIMING_SOURCES)[number];

/** Antecipação permitida (segundos antes do início da frase). */
export const LEAD_LIMITS = { min: 0, max: 1.5, default: 0.3 } as const;
export const MAX_INSTRUCTION = 300;
/** Menor distância entre dois slides seguidos numa sugestão. */
export const MIN_SLIDE_GAP = 0.1;

const round = (t: number) => Math.round(t * 100) / 100;

export class SuggestionRejected extends Error {}

/**
 * Confere a marcação devolvida pela IA: um tempo (ou null) por slide, dentro
 * do áudio e sempre crescente. Arredonda a centésimos. Recusa o que não fecha,
 * em vez de consertar por conta própria.
 */
export function validateSuggestion(raw: unknown, slideCount: number, duration: number | null): (number | null)[] {
  if (!Array.isArray(raw) || raw.length !== slideCount) {
    throw new SuggestionRejected(`A sugestão devia ter ${slideCount} tempos, um por slide.`);
  }
  let previous = -Infinity;
  return raw.map((value, i) => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new SuggestionRejected(`Tempo inválido no slide ${i + 1}.`);
    const t = round(value);
    if (t < 0 || (duration !== null && t > duration)) throw new SuggestionRejected(`O slide ${i + 1} ficou fora do áudio.`);
    if (t < previous + MIN_SLIDE_GAP - 1e-9) throw new SuggestionRejected(`O slide ${i + 1} ficou antes do anterior.`);
    previous = t;
    return t;
  });
}

const close = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.05;

/**
 * O que uma correção mudou: quantos slides, a média do deslocamento e, se for
 * o caso, um deslocamento inteiro em slides (−1: cada slide pegou o tempo do
 * anterior, ou seja, todos entram um slide mais cedo).
 */
export function correctionStats(
  before: (number | null)[],
  after: (number | null)[],
): { changedSlides: number; meanDeltaSeconds: number; slideShift: number | null } {
  const deltas: number[] = [];
  after.forEach((a, i) => {
    const b = before[i];
    if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) >= 0.005) deltas.push(a - b);
  });
  const changed = after.filter((a, i) => (a ?? null) !== (before[i] ?? null)).length;
  let slideShift: number | null = null;
  for (const shift of [-1, 1]) {
    const pairs = after.map((a, i) => [a, before[i + shift]] as const).filter(([a, b]) => typeof a === 'number' && typeof b === 'number');
    if (pairs.length >= 2 && pairs.filter(([a, b]) => close(a, b)).length >= Math.ceil(pairs.length * 0.8)) slideShift = shift;
  }
  // `before[i + shift]`: com −1 o slide i ficou com o tempo de i−1 (mais cedo).
  const mean = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;
  return { changedSlides: changed, meanDeltaSeconds: round(mean), slideShift };
}

export interface CorrectionRecord {
  source: string;
  instruction: string | null;
  changedSlides: number;
  meanDeltaSeconds: number;
  slideShift: number | null;
}

export interface LearnedTiming {
  corrections: number;
  /** Média do deslocamento das correções de tempo fino (arrastar, ±s), em segundos; null sem histórico. */
  meanFineDeltaSeconds: number | null;
  /** Quantas vezes a equipe precisou deslocar a música inteira em slides. */
  slideShifts: { earlier: number; later: number };
  /** Instruções recentes e o que elas fizeram, para dar de exemplo à IA. */
  examples: { instruction: string; slideShift: number | null; meanDeltaSeconds: number; changedSlides: number }[];
}

/** Resume o histórico (mais recente primeiro) no que serve de contexto. */
export function learnFrom(records: CorrectionRecord[]): LearnedTiming {
  const fine = records.filter((r) => ['DRAG', 'NUDGE', 'SHIFT_SECONDS'].includes(r.source) && r.changedSlides > 0);
  const mean = fine.length ? round(fine.reduce((s, r) => s + r.meanDeltaSeconds, 0) / fine.length) : null;
  return {
    corrections: records.length,
    meanFineDeltaSeconds: mean,
    slideShifts: {
      earlier: records.filter((r) => r.slideShift !== null && r.slideShift < 0).length,
      later: records.filter((r) => r.slideShift !== null && r.slideShift > 0).length,
    },
    examples: records
      .filter((r) => r.source === 'INSTRUCTION' && r.instruction)
      .slice(0, 8)
      .map((r) => ({
        instruction: r.instruction as string,
        slideShift: r.slideShift,
        meanDeltaSeconds: r.meanDeltaSeconds,
        changedSlides: r.changedSlides,
      })),
  };
}
