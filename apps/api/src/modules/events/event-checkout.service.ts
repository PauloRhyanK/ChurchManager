import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
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
import { generatePublicCode } from './event-orders.service';
import { TicketDeliveryService } from './ticket-delivery.service';

function formatDueDate(daysFromNow = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class EventCheckoutService {
  private readonly logger = new Logger(EventCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasClient,
    private readonly tenantCredentials: TenantCredentialsService,
    private readonly payerProfiles: PayerProfilesService,
    private readonly ticketTypes: EventTicketTypesService,
    private readonly delivery: TicketDeliveryService,
  ) {}

  async checkout(tenant: Tenant, eventId: string, dto: CreateEventCheckoutDto) {
    if (dto.idempotencyKey?.trim()) {
      const existing = await this.prisma.eventOrder.findUnique({
        where: { idempotencyKey: dto.idempotencyKey.trim() },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (existing) {
        // A chave é única global: se pertence a outro tenant/evento, não há
        // resposta idempotente possível — 409 em vez de colidir no create.
        if (existing.tenantId !== tenant.id || existing.eventId !== eventId) {
          throw new ConflictException(
            'idempotencyKey já utilizada noutro pedido; gere uma chave nova',
          );
        }
        if (existing.status === 'CONFIRMED' && existing.totalCents === 0) {
          return {
            orderId: existing.id,
            eventId,
            transactionId: null,
            asaasPaymentId: null,
            status: 'CONFIRMED',
            billingType: null,
            value: 0,
            dueDate: null,
            invoiceUrl: null,
            bankSlipUrl: null,
            pix: null,
          };
        }
        const tx = existing.transactions[0];
        if (tx) {
          return this.buildCheckoutResponse(existing.id, eventId, tx);
        }
        // Pedido criado sem cobrança associada (falha anterior a meio do
        // checkout): reusar a chave voltaria a colidir no create.
        throw new ConflictException(
          'Pedido anterior ficou incompleto; refaça o checkout com uma idempotencyKey nova',
        );
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

    let subtotalCents = 0;
    for (const line of dto.lines) {
      const type = typeMap.get(line.ticketTypeId)!;
      const err = validateCheckoutLine(type, line.quantity);
      if (err) {
        throw new BadRequestException(err);
      }
      subtotalCents += (type.priceCents + type.feeCents) * line.quantity;
    }
    if (subtotalCents <= 0) {
      throw new BadRequestException('Valor total inválido');
    }

    // Validação e cálculo do cupom (se informado)
    let couponApplied: {
      id: string;
      code: string;
      discountCents: number;
    } | null = null;

    if (dto.couponCode) {
      const code = dto.couponCode.trim().toUpperCase();
      const coupon = await this.prisma.eventCoupon.findUnique({
        where: {
          tenantId_eventId_code: { tenantId: tenant.id, eventId, code },
        },
        include: {
          ticketTypes: { select: { ticketTypeId: true } },
        },
      });

      if (!coupon || !coupon.active) {
        throw new BadRequestException('Cupom inválido ou inativo');
      }

      const now = new Date();
      if (coupon.validFrom && now < coupon.validFrom) {
        throw new BadRequestException('Este cupom ainda não é válido');
      }
      if (coupon.validUntil && now > coupon.validUntil) {
        throw new BadRequestException('Este cupom expirou');
      }
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestException(
          'Este cupom atingiu o limite de utilizações',
        );
      }

      const usedCountForCpf = await this.prisma.eventOrder.count({
        where: {
          tenantId: tenant.id,
          eventId,
          couponId: coupon.id,
          payer: { cpf },
          status: { notIn: ['CANCELLED', 'FAILED', 'EXPIRED'] },
        },
      });
      if (usedCountForCpf >= coupon.maxUsesPerCpf) {
        throw new BadRequestException(
          'Limite de utilizações deste cupom atingido para este CPF',
        );
      }

      const restrictedTicketIds = coupon.ticketTypes.map(
        (t) => t.ticketTypeId,
      );
      const hasRestrictions = restrictedTicketIds.length > 0;

      let eligibleAmount = 0;
      for (const line of dto.lines) {
        if (
          hasRestrictions &&
          !restrictedTicketIds.includes(line.ticketTypeId)
        ) {
          continue;
        }
        const type = typeMap.get(line.ticketTypeId);
        if (type) {
          eligibleAmount += (type.priceCents + type.feeCents) * line.quantity;
        }
      }

      if (eligibleAmount <= 0) {
        throw new BadRequestException(
          'Este cupom não é válido para os ingressos selecionados',
        );
      }

      let discountCents = 0;
      if (coupon.discountType === 'PERCENTAGE') {
        discountCents = Math.round(
          (eligibleAmount * coupon.discountValue) / 100,
        );
      } else {
        discountCents = Math.min(coupon.discountValue, eligibleAmount);
      }

      couponApplied = {
        id: coupon.id,
        code: coupon.code,
        discountCents,
      };
    }

    const discountCents = couponApplied?.discountCents ?? 0;
    const totalCents = Math.max(0, subtotalCents - discountCents);

    // Se o valor for maior que zero, valida regras de pagamento e parcelamento
    const installmentCount =
      dto.billingType === 'CREDIT_CARD' && dto.installmentCount
        ? dto.installmentCount
        : 1;

    if (totalCents > 0) {
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
    }

    // Campos personalizados obrigatórios (agregados dos ingressos do pedido).
    const requirements = types.flatMap((t) =>
      t.fieldConfigs.map((fc) => ({
        fieldId: fc.fieldId,
        key: fc.field.key,
        label: fc.field.label,
        type: fc.field.type,
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

      if (couponApplied) {
        await tx.eventCoupon.update({
          where: { id: couponApplied.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      const order = await tx.eventOrder
        .create({
          data: {
            tenantId: tenant.id,
            eventId,
            payerProfileId: profile.id,
            status: totalCents === 0 ? 'CONFIRMED' : 'PENDING',
            confirmedAt: totalCents === 0 ? new Date() : null,
            totalCents,
            discountCents,
            couponId: couponApplied?.id ?? null,
            couponCode: couponApplied?.code ?? null,
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
        })
        .catch((err) => {
          // Corrida entre dois checkouts com a mesma idempotencyKey nova: o
          // índice único é o árbitro, e o perdedor recebe 409 em vez de 500.
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new ConflictException(
              'Checkout já em curso para esta idempotencyKey; aguarde e consulte o pedido',
            );
          }
          throw err;
        });

      return order;
    });

    // Se o cupom deu 100% de desconto (total 0), emite bilhetes e confirma sem Asaas
    if (totalCents === 0) {
      const payerName = profile.name || 'Participante';
      await this.prisma.$transaction(async (tx) => {
        const ticketsData: Prisma.EventTicketCreateManyInput[] = [];
        for (const line of dto.lines) {
          for (let i = 0; i < line.quantity; i++) {
            const named = line.holderNames?.[i]?.trim();
            ticketsData.push({
              tenantId: tenant.id,
              orderId: orderResult.id,
              ticketTypeId: line.ticketTypeId,
              publicCode: generatePublicCode(),
              holderName: named && named.length > 0 ? named : payerName,
            });
          }
        }
        if (ticketsData.length > 0) {
          await tx.eventTicket.createMany({ data: ticketsData });
        }
      });

      try {
        await this.delivery.sendTicketsForOrder(orderResult.id);
      } catch (err) {
        this.logger.error(
          `Bilhetes do pedido gratuito ${orderResult.id} emitidos, mas o e-mail falhou`,
          err,
        );
      }

      return {
        orderId: orderResult.id,
        eventId,
        transactionId: null,
        asaasPaymentId: null,
        status: 'CONFIRMED',
        billingType: null,
        value: 0,
        dueDate: null,
        invoiceUrl: null,
        bankSlipUrl: null,
        pix: null,
      };
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
