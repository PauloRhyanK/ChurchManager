/** Data mínima para inputs type="date" (hoje, fuso local). */
export function todayDateInputMin(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isEventDateNotPast(date: string): boolean {
  return date >= todayDateInputMin();
}

export function isTimeEndAfterStart(timeStart: string, timeEnd: string): boolean {
  const start = timeStart.trim().slice(0, 5);
  const end = timeEnd.trim().slice(0, 5);
  return end > start;
}

export function isSalesCloseAfterOpen(opensAt: string, closesAt: string): boolean {
  if (!opensAt?.trim() || !closesAt?.trim()) return true;
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  if (Number.isNaN(open) || Number.isNaN(close)) return true;
  return close > open;
}
