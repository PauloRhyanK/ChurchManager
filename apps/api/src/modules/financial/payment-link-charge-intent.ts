/**
 * Regras de negócio: cobrança única vs assinatura mensal nos links Asaas.
 * `isMonthly` + `subscriptionDurationMonths === 1` é sempre pagamento único (`DETACHED`).
 */

export type PaymentLinkChargeConfig = {
  isMonthly: boolean;
  subscriptionDurationMonths?: number | null;
};

/** Deve ir ao Asaas como `chargeType: DETACHED` (sem recorrência). */
export function isSinglePaymentCharge(config: PaymentLinkChargeConfig): boolean {
  return !config.isMonthly || config.subscriptionDurationMonths === 1;
}

/** Links antigos criados antes da normalização (RECURRENT + 1 mês). */
export function isLegacyWrongOneMonthRecurrentLink(
  stored: PaymentLinkChargeConfig,
): boolean {
  return (
    stored.isMonthly === true && stored.subscriptionDurationMonths === 1
  );
}

export function storedLinkMatchesChargeIntent(
  stored: PaymentLinkChargeConfig,
  intended: PaymentLinkChargeConfig,
): boolean {
  const storedMonths = stored.subscriptionDurationMonths ?? null;
  const intendedMonths = intended.subscriptionDurationMonths ?? null;
  return (
    stored.isMonthly === intended.isMonthly &&
    storedMonths === intendedMonths
  );
}

/** Normaliza "1 mês mensal" para cobrança única na BD e no Asaas. */
export function normalizeSinglePaymentCharge<T extends PaymentLinkChargeConfig>(
  data: T,
): T {
  if (data.isMonthly && data.subscriptionDurationMonths === 1) {
    return {
      ...data,
      isMonthly: false,
      subscriptionDurationMonths: undefined,
    };
  }
  return data;
}
