/**
 * Extrai "N" de textos Asaas gerados pelo app, ex.:
 * «Assinatura mensal — 5 meses (link público)».
 * Não cobre parcelamento de cartão (installmentCount).
 */
export function inferSubscriptionMonthsFromDescription(
  text: string | null | undefined,
): number | null {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const m = text.match(/(\d+)\s*mes(es)?\b/i);
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 600) {
    return null;
  }
  return n;
}
