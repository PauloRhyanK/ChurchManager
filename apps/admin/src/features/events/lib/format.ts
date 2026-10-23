/** Data do evento (YYYY-MM-DD, sem fuso) por extenso; formatada em UTC para não recuar um dia. */
export function formatEventDate(date: string) {
  try {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  } catch {
    return date;
  }
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function formatTime(value: string | null) {
  if (!value) return "—";
  return value.slice(0, 5);
}

/** Horário do evento: "13:00 – 17:00", só o início, "até 17:00" ou "" sem horário. */
export function formatTimeRange(timeStart: string | null, timeEnd: string | null) {
  const start = timeStart ? formatTime(timeStart) : "";
  const end = timeEnd ? formatTime(timeEnd) : "";
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return `até ${end}`;
  return "";
}

const moneyBr = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatMoneyCents(cents: number) {
  return moneyBr.format(cents / 100);
}

export function parseMoneyToCents(value: string): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function centsToMoneyInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function orderStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: "Pendente",
    CONFIRMED: "Confirmado",
    FAILED: "Falhou",
    EXPIRED: "Expirado",
    CANCELLED: "Cancelado",
  };
  return map[status] ?? status;
}
