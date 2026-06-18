import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AsaasBillingType,
  AsaasAccountResponse,
  AsaasCallbackInput,
  AsaasCustomerResponse,
  AsaasPaymentResponse,
  AsaasPaymentLinkCreateInput,
  AsaasPaymentLinkResponse,
  AsaasSubscriptionResponse,
  AsaasSubscriptionUpdateInput,
} from './asaas.types';

@Injectable()
export class AsaasClient {
  private readonly baseUrl: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('ASAAS_API_URL') ??
      'https://api-sandbox.asaas.com/v3';
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      access_token: apiKey,
    };
  }

  async validateApiKey(apiKey: string): Promise<AsaasAccountResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/myAccount`, {
        method: 'GET',
        headers: this.headers(apiKey),
      });
      let data: AsaasAccountResponse & {
        errors?: Array<{ description?: string }>;
      };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        throw new ServiceUnavailableException(
          'Resposta inválida do Asaas ao validar a chave. Confirme ASAAS_API_URL (sandbox: https://api-sandbox.asaas.com/v3 , produção: https://api.asaas.com/v3 ).',
        );
      }
      if (!res.ok) {
        const msg =
          data.errors?.[0]?.description ?? `Asaas myAccount HTTP ${res.status}`;
        if (res.status >= 400 && res.status < 500) {
          throw new BadRequestException(
            `${msg} Se a chave estiver correta, use URL de Sandbox com chave de testes e URL de produção com chave de produção.`,
          );
        }
        throw new ServiceUnavailableException(msg);
      }
      return data;
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      const cause = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException(
        `Não foi possível contactar o Asaas: ${cause}`,
      );
    }
  }

  async createCustomer(input: {
    apiKey: string;
    name: string;
    email: string;
    phone?: string;
    mobilePhone?: string;
    cpfCnpj: string;
  }): Promise<AsaasCustomerResponse> {
    const res = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.headers(input.apiKey),
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        phone: input.phone,
        mobilePhone: input.mobilePhone ?? input.phone,
        cpfCnpj: input.cpfCnpj,
        notificationDisabled: false,
      }),
    });
    const data = (await res.json()) as AsaasCustomerResponse & {
      errors?: Array<{ description?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ?? `Asaas customers ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data;
  }

  /** Usado pelo webhook para enriquecer pagador; falhas propagam 500 para retry Asaas. */
  async getCustomer(input: {
    apiKey: string;
    customerId: string;
  }): Promise<AsaasCustomerResponse> {
    const res = await fetch(
      `${this.baseUrl}/customers/${encodeURIComponent(input.customerId)}`,
      {
        method: 'GET',
        headers: this.headers(input.apiKey),
      },
    );
    const data = (await res.json()) as AsaasCustomerResponse & {
      errors?: Array<{ description?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ?? `Asaas customers GET ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data;
  }

  /** Lista cobranças (ex.: filtro `paymentLink` para achar assinatura de um link legado). */
  async listPayments(input: {
    apiKey: string;
    paymentLink?: string;
    subscription?: string;
    limit?: number;
    offset?: number;
  }): Promise<AsaasPaymentResponse[]> {
    const params = new URLSearchParams();
    if (input.paymentLink?.trim()) {
      params.set('paymentLink', input.paymentLink.trim());
    }
    if (input.subscription?.trim()) {
      params.set('subscription', input.subscription.trim());
    }
    params.set('limit', String(input.limit ?? 100));
    if (input.offset != null) {
      params.set('offset', String(input.offset));
    }
    const res = await fetch(`${this.baseUrl}/payments?${params}`, {
      method: 'GET',
      headers: this.headers(input.apiKey),
    });
    const data = (await res.json()) as {
      data?: AsaasPaymentResponse[];
      errors?: Array<{ description?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ?? `Asaas payments GET ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data.data ?? [];
  }

  /** Remove cobrança pendente/vencida (DELETE /payments/{id}). */
  async deletePayment(input: {
    apiKey: string;
    paymentId: string;
  }): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/payments/${encodeURIComponent(input.paymentId)}`,
      {
        method: 'DELETE',
        headers: this.headers(input.apiKey),
      },
    );
    if (res.ok || res.status === 404) {
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ description?: string }>;
    };
    const msg =
      data.errors?.[0]?.description ?? `Asaas payments DELETE ${res.status}`;
    throw new InternalServerErrorException(msg);
  }

  /** Estorna cobrança recebida/confirmada (POST /payments/{id}/refund). */
  async refundPayment(input: {
    apiKey: string;
    paymentId: string;
  }): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/payments/${encodeURIComponent(input.paymentId)}/refund`,
      {
        method: 'POST',
        headers: this.headers(input.apiKey),
        body: JSON.stringify({}),
      },
    );
    if (res.ok) {
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ description?: string }>;
    };
    const msg =
      data.errors?.[0]?.description ?? `Asaas payments refund ${res.status}`;
    throw new InternalServerErrorException(msg);
  }

  async createPayment(input: {
    apiKey: string;
    customerId: string;
    billingType: AsaasBillingType;
    value: number;
    dueDate: string;
    description?: string;
    externalReference?: string;
    callback?: AsaasCallbackInput;
    /** Cartão parcelado: número de parcelas (>1). Define totalValue = value. */
    installmentCount?: number;
  }): Promise<AsaasPaymentResponse> {
    const installments =
      input.installmentCount && input.installmentCount > 1
        ? {
            installmentCount: input.installmentCount,
            totalValue: input.value,
          }
        : { value: input.value };
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.headers(input.apiKey),
      body: JSON.stringify({
        customer: input.customerId,
        billingType: input.billingType,
        ...installments,
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.externalReference,
        ...(input.callback ? { callback: input.callback } : {}),
      }),
    });
    const data = (await res.json()) as AsaasPaymentResponse & {
      errors?: Array<{ description?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ?? `Asaas payments ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data;
  }

  async createPaymentLink(input: {
    apiKey: string;
    body: AsaasPaymentLinkCreateInput;
  }): Promise<AsaasPaymentLinkResponse> {
    /** Asaas exige com `UNDEFINED` (boleto entre opções) ou `BOLETO`. Alinhado a `PaymentLinksGenerationService`. */
    const requiresDueLimit =
      input.body.billingType === 'UNDEFINED' ||
      input.body.billingType === 'BOLETO';
    const body: AsaasPaymentLinkCreateInput = {
      ...input.body,
      dueDateLimitDays:
        input.body.dueDateLimitDays ??
        (requiresDueLimit ? 10 : undefined),
    };
    const res = await fetch(`${this.baseUrl}/paymentLinks`, {
      method: 'POST',
      headers: this.headers(input.apiKey),
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as AsaasPaymentLinkResponse & {
      errors?: Array<{ description?: string; code?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ?? `Asaas paymentLinks ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data;
  }

  /**
   * Atualiza assinatura (ex.: `endDate` — data limite de cobranças).
   * @see https://docs.asaas.com/reference/atualizar-assinatura-existente
   */
  async updateSubscription(input: {
    apiKey: string;
    subscriptionId: string;
    body: AsaasSubscriptionUpdateInput;
  }): Promise<AsaasSubscriptionResponse> {
    const res = await fetch(
      `${this.baseUrl}/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
      {
        method: 'PUT',
        headers: this.headers(input.apiKey),
        body: JSON.stringify(input.body),
      },
    );
    const data = (await res.json()) as AsaasSubscriptionResponse & {
      errors?: Array<{ description?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ??
        `Asaas subscriptions PUT ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data;
  }

  /**
   * Remove assinatura no Asaas (soft delete; remove parcelas pendentes/vencidas).
   * @see https://docs.asaas.com/reference/remove-subscription
   */
  async deleteSubscription(input: {
    apiKey: string;
    subscriptionId: string;
  }): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
      {
        method: 'DELETE',
        headers: this.headers(input.apiKey),
      },
    );
    if (res.ok || res.status === 404) {
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ description?: string }>;
    };
    const msg =
      data.errors?.[0]?.description ??
      `Asaas subscriptions DELETE ${res.status}`;
    throw new InternalServerErrorException(msg);
  }

  /** Remove o link no Asaas ([Remove a payments link](https://docs.asaas.com/reference/remove-a-payments-link)). */
  async deletePaymentLink(input: {
    apiKey: string;
    linkId: string;
  }): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/paymentLinks/${encodeURIComponent(input.linkId)}`,
      {
        method: 'DELETE',
        headers: this.headers(input.apiKey),
      },
    );
    if (res.ok || res.status === 404) {
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ description?: string }>;
    };
    const msg =
      data.errors?.[0]?.description ??
      `Asaas paymentLinks DELETE ${res.status}`;
    throw new InternalServerErrorException(msg);
  }
}
