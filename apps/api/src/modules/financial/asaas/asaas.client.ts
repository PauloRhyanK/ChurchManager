import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AsaasBillingType,
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

  private apiKey(): string {
    const key = this.config.get<string>('ASAAS_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'ASAAS_API_KEY não configurada no servidor',
      );
    }
    return key;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      access_token: this.apiKey(),
    };
  }

  async createCustomer(input: {
    name: string;
    email: string;
    phone?: string;
    mobilePhone?: string;
    cpfCnpj: string;
  }): Promise<AsaasCustomerResponse> {
    const res = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.headers(),
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
    customerId: string;
    billingType: AsaasBillingType;
    value: number;
    dueDate: string;
    description?: string;
    externalReference?: string;
  }): Promise<AsaasPaymentResponse> {
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.headers(),
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
