export function formatEventDate(date: string) {
  try {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
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
