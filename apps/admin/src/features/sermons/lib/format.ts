import type { SermonSummary } from "../api/sermons-api";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "João 8:12 · 3 pontos"; sem versículo só os pontos. */
export function formatBase(summary: Pick<SermonSummary, "baseReference" | "pointCount">): string {
  const n = summary.pointCount;
  const points = n === 0 ? "sem pontos ainda" : n === 1 ? "1 ponto" : `${n} pontos`;
  return summary.baseReference ? `${summary.baseReference} · ${points}` : points;
}

/** "dom 22/11" a partir de 'AAAA-MM-DD', sem deslocamento de fuso (lê como UTC). */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "19h" ou "19h30". */
export function formatHour(startTime: string): string {
  const [h, min] = startTime.split(":").map(Number);
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, "0")}`;
}

export function formatSituation(summary: Pick<SermonSummary, "status" | "delivery">): string {
  const { status, delivery } = summary;
  if (status === "DRAFT" || !delivery) return "Rascunho";
  if (status === "PREACHED") return `Pregada · ${formatDay(delivery.date)}`;
  return `Enviada · ${formatDay(delivery.date)}, ${formatHour(delivery.startTime)}`;
}

export function formatSpeech(seconds: number): string {
  if (seconds < 60) return "menos de 1 min de fala";
  return `${Math.round(seconds / 60)} min de fala`;
}
