/** Resposta parcial da API Asaas v3 — cliente (POST/GET customers) */
export interface AsaasCustomerResponse {
  id: string;
  name?: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
}

/** Resposta parcial — validação de credencial */
export interface AsaasAccountResponse {
  id?: string;
  name?: string;
  email?: string;
}

/** Resposta parcial — cobrança criada */
export interface AsaasPaymentResponse {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  billingType: string;
  status: string;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  invoiceNumber?: string;
  externalReference?: string;
  /** PIX */
  pixTransaction?: {
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
  };
}

export type AsaasBillingType = 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';

/** Pedido parcial — POST /v3/paymentLinks */
export type AsaasPaymentLinkChargeType = 'DETACHED' | 'RECURRENT' | 'INSTALLMENT';

export type AsaasPaymentLinkBillingType =
  | 'UNDEFINED'
  | 'BOLETO'
  | 'CREDIT_CARD'
  | 'PIX';

export type AsaasPaymentLinkSubscriptionCycle =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'BIMONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUALLY'
  | 'YEARLY';

export interface AsaasPaymentLinkCreateInput {
  name: string;
  description?: string;
  billingType: AsaasPaymentLinkBillingType;
  chargeType: AsaasPaymentLinkChargeType;
  value?: number;
  subscriptionCycle?: AsaasPaymentLinkSubscriptionCycle;
  /** Limite de vigência da assinatura no link (YYYY-MM-DD). Ver API Asaas `paymentLinks`. */
  endDate?: string;
  dueDateLimitDays?: number;
  externalReference?: string;
  notificationEnabled?: boolean;
}

/** Resposta parcial — link de pagamentos criado */
export interface AsaasPaymentLinkResponse {
  id: string;
  url: string;
  name?: string;
  value?: number;
  chargeType?: string;
  billingType?: string;
  subscriptionCycle?: string;
  externalReference?: string;
  active?: boolean;
}
