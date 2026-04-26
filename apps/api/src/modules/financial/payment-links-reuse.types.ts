export const FINANCIAL_LINK_MODULES = ['cotas', 'events'] as const;
export type FinancialLinkModule = (typeof FINANCIAL_LINK_MODULES)[number];

export const FINANCIAL_PAYMENT_LINK_REUSE_MODES = [
  'preset_global',
  'cpf_custom',
  'event_auto',
] as const;
export type FinancialPaymentLinkReuseMode =
  (typeof FINANCIAL_PAYMENT_LINK_REUSE_MODES)[number];

export function toPrismaFinancialLinkModule(
  module: FinancialLinkModule,
): 'COTAS' | 'EVENTS' {
  return module === 'events' ? 'EVENTS' : 'COTAS';
}

export function fromPrismaFinancialLinkModule(
  module: 'COTAS' | 'EVENTS',
): FinancialLinkModule {
  return module === 'EVENTS' ? 'events' : 'cotas';
}

export function toPrismaLinkMode(
  mode: FinancialPaymentLinkReuseMode,
): 'PRESET_GLOBAL' | 'CPF_CUSTOM' | 'EVENT_AUTO' {
  if (mode === 'cpf_custom') return 'CPF_CUSTOM';
  if (mode === 'event_auto') return 'EVENT_AUTO';
  return 'PRESET_GLOBAL';
}

export function fromPrismaLinkMode(
  mode: 'PRESET_GLOBAL' | 'CPF_CUSTOM' | 'EVENT_AUTO',
): FinancialPaymentLinkReuseMode {
  if (mode === 'CPF_CUSTOM') return 'cpf_custom';
  if (mode === 'EVENT_AUTO') return 'event_auto';
  return 'preset_global';
}
