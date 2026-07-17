import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCpf, isValidCpfDigits } from '../../common/cpf';
import { AsaasClient } from '../financial/asaas/asaas.client';
import { AsaasBillingType } from '../financial/asaas/asaas.types';
import { TenantCredentialsService } from '../tenants/tenant-credentials.service';
import { PayerProfilesService } from '../financial/payer-profiles.service';
import { CreateEventCheckoutDto } from './dto/create-event-checkout.dto';
import { buildEventOrderExternalReference } from './event-order-external-reference';
import { EventTicketTypesService } from './event-ticket-types.service';
import { validateCheckoutLine } from './event-stock.util';
import { collectFieldValues } from './event-field-validation.util';

function formatDueDate(daysFromNow = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class EventCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasClient,
    private readonly tenantCredentials: TenantCredentialsService,
    private readonly payerProfiles: PayerProfilesService,
    private readonly ticketTypes: EventTicketTypesService,
  ) {}

  async checkout(tenant: Tenant, eventId: string, dto: CreateEventCheckoutDto) {
    if (dto.idempotencyKey?.trim()) {
      const existing = await this.prisma.eventOrder.findUnique({
        where: { idempotencyKey: dto.idempotencyKey.trim() },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (existing && existing.tenantId === tenant.id && existing.eventId === eventId) {
        const tx = existing.transactions[0];
        if (tx) {
          return this.buildCheckoutResponse(existing.id, eventId, tx);
        }
      }
    }

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId: tenant.id, published: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
    if (!dto.lines?.length) {
      throw new BadRequestException('Informe ao menos um ingresso');
    }

    const cpf = normalizeCpf(dto.payer.cpf);
    if (!isValidCpfDigits(cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    const typeIds = dto.lines.map((l) => l.ticketTypeId);
    const types = await this.prisma.eventTicketType.findMany({
      where: { tenantId: tenant.id, eventId, id: { in: typeIds } },
      include: { fieldConfigs: { include: { field: true } } },
    });
    if (types.length !== typeIds.length) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    const typeMap = new Map(types.map((t) => [t.id, t]));

    let totalCents = 0;
    for (const line of dto.lines) {
      const type = typeMap.get(line.ticketTypeId)!;
      const err = validateCheckoutLine(type, line.quantity);
      if (err) {
        throw new BadRequestException(err);
      }
      totalCents += (type.priceCents + type.feeCents) * line.quantity;
    }
    if (totalCents <= 0) {
      throw new BadRequestException('Valor total inválido');
    }

    // Tipo de pagamento permitido por todos os ingressos selecionados.
    for (const type of types) {
      if (
        type.allowedBillingTypes.length > 0 &&
        !type.allowedBillingTypes.includes(dto.billingType)
      ) {
        throw new BadRequestException(
          `Pagamento "${dto.billingType}" não permitido para "${type.name}"`,
        );
      }
    }

    // Parcelamento — só cartão e dentro do limite de cada ingresso.
    const installmentCount =
      dto.billingType === 'CREDIT_CARD' && dto.installmentCount
        ? dto.installmentCount
        : 1;
    if (installmentCount > 1) {
      for (const type of types) {
        const max = type.maxInstallments ?? 1;
        if (installmentCount > max) {
          throw new BadRequestException(
            `"${type.name}" permite no máximo ${max}x`,
          );
        }
      }
    }

    // Campos personalizados obrigatórios (agregados dos ingressos do pedido).
    const requirements = types.flatMap((t) =>
      t.fieldConfigs.map((fc) => ({
        fieldId: fc.fieldId,
        key: fc.field.key,
        label: fc.field.label,
        enabled: fc.enabled,
        required: fc.required,
      })),
    );
    const fieldValuesToPersist = collectFieldValues(
      requirements,
      dto.fieldValues,
    );

    const profile = await this.payerProfiles.upsertForTenant(tenant.id, {
      cpf,
      name: dto.payer.name,
      email: dto.payer.email,
      phone: dto.payer.phone,
    });

    const orderResult = await this.prisma.$transaction(async (tx) => {
      for (const line of dto.lines) {
        const ok = await this.ticketTypes.reserveStock(
          tx,
          tenant.id,
          line.ticketTypeId,
          line.quantity,
        );
        if (!ok) {
          throw new ConflictException(
            'Estoque insuficiente; atualize a página e tente novamente',
          );
        }
      }

      const order = await tx.eventOrder.create({
        data: {
          tenantId: tenant.id,
          eventId,
          payerProfileId: profile.id,
          status: 'PENDING',
          totalCents,
          currency: event.currency,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
          lines: {
            create: dto.lines.map((line) => {
              const type = typeMap.get(line.ticketTypeId)!;
              return {
                ticketTypeId: line.ticketTypeId,
                quantity: line.quantity,
                unitPriceCents: type.priceCents + type.feeCents,
                holderNames: (line.holderNames ?? [])
                  .slice(0, line.quantity)
                  .map((n) => n.trim())
                  .filter((n) => n.length > 0),
              };
            }),
          },
          ...(fieldValuesToPersist.length > 0
            ? {
                fieldValues: {
                  create: fieldValuesToPersist.map((fv) => ({
                    fieldId: fv.fieldId,
                    value: fv.value,
                  })),
                },
              }
            : {}),
        },
      });

      return order;
    });

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
      value: totalCents / 100,
      dueDate,
      description: `Ingressos — ${event.title}`,
      externalReference: buildEventOrderExternalReference(
        tenant.slug,
        orderResult.id,
      ),
      ...(installmentCount > 1 ? { installmentCount } : {}),
    });

    const financialTx = await this.prisma.financialTransaction.create({
      data: {
        tenantId: tenant.id,
        payerProfileId: profile.id,
        eventOrderId: orderResult.id,
        asaasPaymentId: payment.id,
        type: 'EVENT_CHECKOUT',
        amountCents: totalCents,
        status: 'PENDING',
        billingType: payment.billingType,
        rawPayloadRef: { eventId, orderId: orderResult.id },
      },
    });

    return {
      orderId: orderResult.id,
      eventId,
      transactionId: financialTx.id,
      asaasPaymentId: payment.id,
      status: 'PENDING',
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
        : null,
    };
  }

  private buildCheckoutResponse(
    orderId: string,
    eventId: string,
    tx: {
      id: string;
      asaasPaymentId: string | null;
      status: string;
      billingType: string | null;
      amountCents: number;
    },
  ) {
    return {
      orderId,
      eventId,
      transactionId: tx.id,
      asaasPaymentId: tx.asaasPaymentId,
      status: tx.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
      billingType: tx.billingType,
      value: tx.amountCents / 100,
      dueDate: null,
      invoiceUrl: null,
      bankSlipUrl: null,
      pix: null,
    };
  }
}
