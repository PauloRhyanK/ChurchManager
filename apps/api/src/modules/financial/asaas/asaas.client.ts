import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AsaasBillingType,
  AsaasAccountResponse,
  AsaasCustomerResponse,
  AsaasPaymentResponse,
} from './asaas.types';

@Injectable()
export class AsaasClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('ASAAS_API_URL') ??
      'https://sandbox.asaas.com/api/v3';
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      access_token: apiKey,
    };
  }

  async validateApiKey(apiKey: string): Promise<AsaasAccountResponse> {
    const res = await fetch(`${this.baseUrl}/myAccount`, {
      method: 'GET',
      headers: this.headers(apiKey),
    });
    const data = (await res.json()) as AsaasAccountResponse & {
      errors?: Array<{ description?: string }>;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.description ?? `Asaas myAccount ${res.status}`;
      throw new InternalServerErrorException(msg);
    }
    return data;
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

  async createPayment(input: {
    apiKey: string;
    customerId: string;
    billingType: AsaasBillingType;
    value: number;
    dueDate: string;
    description?: string;
    externalReference?: string;
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
}
