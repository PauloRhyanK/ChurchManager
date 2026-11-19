import type { MomentKind } from "../api/worship-api";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const toClock = (minutes: number) => {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
};

/**
 * Horário de cada momento de um modelo, com a mesma regra da API
 * (`service-schedule.ts`): os "antes do culto" do começo contam para trás a
 * partir do início; o resto, para a frente.
 */
export function momentTimes(
  startTime: string,
  moments: { kind: MomentKind; durationMinutes: number }[],
): { startsAt: string[]; endsAt: string; totalMinutes: number } {
  let leading = 0;
  while (leading < moments.length && moments[leading].kind === "PRE_SERVICE") leading += 1;
  let clock = toMinutes(startTime) - moments.slice(0, leading).reduce((a, m) => a + m.durationMinutes, 0);
  const startsAt = moments.map((m) => {
    const at = toClock(clock);
    clock += m.durationMinutes;
    return at;
  });
  return { startsAt, endsAt: toClock(clock), totalMinutes: moments.reduce((a, m) => a + m.durationMinutes, 0) };
}

/** 95 → "1 h 35 min"; 40 → "40 min"; 120 → "2 h". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
