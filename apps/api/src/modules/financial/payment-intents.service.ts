import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AsaasClient } from './asaas/asaas.client';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { normalizeCpf, isValidCpfDigits } from '../../common/cpf';
import { AsaasBillingType } from './asaas/asaas.types';
import { TenantCredentialsService } from '../tenants/tenant-credentials.service';

function formatDueDate(daysFromNow = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasClient,
    private readonly tenantCredentials: TenantCredentialsService,
  ) {}

  async createIntent(tenant: Tenant, dto: CreatePaymentIntentDto) {
    const tenantId = tenant.id;
    const cpf = normalizeCpf(dto.cpf);
    if (!isValidCpfDigits(cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    if (!dto.planId && (dto.value === undefined || dto.value === null)) {
      throw new BadRequestException('Informe planId ou value');
    }
    if (dto.planId && dto.value !== undefined) {
      throw new BadRequestException('Use apenas planId ou value, não ambos');
    }

    let amountReais: number;
    let description: string | undefined;

    if (dto.planId) {
      const plan = await this.prisma.financialPlan.findFirst({
        where: { id: dto.planId, tenantId, isActive: true },
      });
      if (!plan) {
        throw new NotFoundException('Plano não encontrado');
      }
      amountReais = plan.amountCents / 100;
      description = plan.name;
    } else {
      amountReais = dto.value!;
      description = 'Pagamento';
    }

    const profile = await this.prisma.financialPayerProfile.findUnique({
      where: { tenantId_cpf: { tenantId, cpf } },
    });
    if (!profile) {
      throw new NotFoundException(
        'Perfil não encontrado; faça primeiro o pré-cadastro',
      );
    }

    let asaasCustomerId = profile.asaasCustomerId;
    if (!asaasCustomerId) {
      const customer = await this.asaas.createCustomer({
        apiKey: this.tenantCredentials.getDecryptedApiKey(tenant.asaasApiKey),
        name: profile.name,
        email: profile.email,
        phone: profile.phone ?? undefined,
        cpfCnpj: cpf,
      });
      asaasCustomerId = customer.id;
      await this.prisma.financialPayerProfile.update({
        where: { id: profile.id },
        data: { asaasCustomerId },
      });
    }

    const billingType = dto.billingType as AsaasBillingType;
    const dueDate =
      billingType === 'BOLETO' ? formatDueDate(3) : formatDueDate(0);

    const payment = await this.asaas.createPayment({
      apiKey: this.tenantCredentials.getDecryptedApiKey(tenant.asaasApiKey),
      customerId: asaasCustomerId,
      billingType,
      value: amountReais,
      dueDate,
      description,
      externalReference: profile.id,
    });

    const amountCents = Math.round(amountReais * 100);

    const tx = await this.prisma.financialTransaction.create({
      data: {
        tenantId,
        payerProfileId: profile.id,
        asaasPaymentId: payment.id,
        type: 'PAYMENT_CREATED',
        amountCents,
        status: 'PENDING',
        billingType: payment.billingType,
      },
    });

    return {
      transactionId: tx.id,
      asaasPaymentId: payment.id,
      status: payment.status,
      billingType: payment.billingType,
      value: payment.value,
      dueDate: payment.dueDate,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      pix: payment.pixTransaction
        ? {
            encodedImage: payment.pixTransaction.encodedImage,
            payload: payment.pixTransaction.payload,
            expirationDate: payment.pixTransaction.expirationDate,
          }
        : undefined,
    };
  }
}
