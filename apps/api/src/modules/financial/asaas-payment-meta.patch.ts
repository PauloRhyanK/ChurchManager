/**
 * Campos opcionais do object `payment` nos webhooks Asaas v3
 * (além dos já usados para criar financial_transactions).
 */
export type AsaasPaymentWebhookFields = {
  id?: string;
  status?: string;
  value?: number;
  customer?: string;
  externalReference?: string;
  billingType?: string;
  /** ID da subscrição no Asaas (string `sub_...`), aninhado em `payment`. */
  subscription?: string;
  description?: string;
  /** ID do payment link no Asaas. */
  paymentLink?: string;
  installmentNumber?: number | null;
};

/** Grava metadados Asaas em `raw_payload_ref` (merge superficial). */
export function paymentAsaasMetaPatch(
  payment: AsaasPaymentWebhookFields | undefined,
): Record<string, unknown> {
  if (!payment) {
    return {};
  }
  const out: Record<string, unknown> = {};
  if (typeof payment.subscription === 'string' && payment.subscription.trim()) {
    out.asaasSubscriptionId = payment.subscription.trim();
  }
  if (typeof payment.paymentLink === 'string' && payment.paymentLink.trim()) {
    out.asaasPaymentLinkId = payment.paymentLink.trim();
  }
  if (typeof payment.description === 'string' && payment.description.trim()) {
    out.paymentDescription = payment.description.trim().slice(0, 500);
  }
  if (
    payment.installmentNumber !== undefined &&
    payment.installmentNumber !== null
  ) {
    out.installmentNumber = payment.installmentNumber;
  }
  return out;
}

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Rótulo para o painel de cotas quando não há `financial_subscriptions` + plano.
 */
export function planLabelFromRawPayloadRef(
  raw: unknown,
  fallbackAmountCents: number,
): string | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const desc = o.paymentDescription;
  if (typeof desc === 'string' && desc.trim()) {
    return desc.trim();
  }
  const link = o.linkTracking;
  if (link && typeof link === 'object' && fallbackAmountCents > 0) {
    const sk = (link as Record<string, unknown>).sourceKey;
    const src = typeof sk === 'string' ? sk : 'link';
    return `${moneyFmt.format(fallbackAmountCents / 100)} (${src})`;
  }
  return null;
}
