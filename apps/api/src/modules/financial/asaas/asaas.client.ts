import {
  BadRequestException,
  HttpException,
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
} from './asaas.types';

@Injectable()
export class AsaasClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
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

  async createPayment(input: {
    apiKey: string;
    customerId: string;
    billingType: AsaasBillingType;
    value: number;
    dueDate: string;
    description?: string;
    externalReference?: string;
    callback?: AsaasCallbackInput;
  }): Promise<AsaasPaymentResponse> {
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.headers(input.apiKey),
      body: JSON.stringify({
        customer: input.customerId,
        billingType: input.billingType,
        value: input.value,
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
}
