import { addMonths, format, subDays } from 'date-fns';

/**
 * Soma calendário em meses (mês de saída “rola” para o último dia do mês se necessário).
 * Usa `date-fns` em vez de `Date#setMonth` nativo.
 */
export function addCalendarMonths(from: Date, months: number): Date {
  return addMonths(from, months);
}

export function toLocalDateYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * `endDate` do link Asaas (prazo para gerar cobranças recorrentes).
 * Fórmula: `addMonths(hoje, N) - 1 dia` evita a cobrança extra na linha N+1 que ocorria com `addMonths(hoje, N)` como limite.
 *
 * Usa calendário local do processo Node (recomenda-se `TZ=America/Sao_Paulo` em produção).
 */
export function computeSubscriptionEndDateYmd(
  durationMonths: number,
  from: Date = new Date(),
): string {
  return toLocalDateYmd(subDays(addMonths(from, durationMonths), 1));
}
