/** Datas do calendário de cultos, em AAAA-MM-DD e AAAA-MM. */

export const pad = (n: number) => String(n).padStart(2, "0");

/** Hoje em AAAA-MM-DD, no fuso do navegador. */
export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11" + 1 → "2026-12". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** "AAAA-MM" válido, ou null. */
export function parseMonth(value: string | null): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}
