/**
 * Data de fim de assinatura para links Asaas (`endDate`).
 * Usa calendário local do processo Node (recomenda-se `TZ=America/Sao_Paulo` em produção).
 */
export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

export function toLocalDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeSubscriptionEndDateYmd(
  durationMonths: number,
  from: Date = new Date(),
): string {
  return toLocalDateYmd(addCalendarMonths(from, durationMonths));
}
