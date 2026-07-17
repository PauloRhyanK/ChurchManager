import { randomBytes } from 'crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventTicketTypesService } from './event-ticket-types.service';
import { formatDateOnly, formatTimeOnly } from './event-format.util';

export function generatePublicCode(): string {
  return randomBytes(9).toString('base64url');
}

@Injectable()
export class EventOrdersService {
  private readonly logger = new Logger(EventOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketTypes: EventTicketTypesService,
  ) {}

  async getPaymentStatus(
    tenantId: string,
    eventId: string,
    orderId: string,
  ) {
    const order = await this.prisma.eventOrder.findFirst({
      where: { id: orderId, tenantId, eventId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }
    const tx = order.transactions[0];
    const status = this.mapOrderPaymentStatus(order.status, tx?.status);
    return {
      transactionId: tx?.id ?? null,
      orderId: order.id,
      status,
      asaasPaymentId: tx?.asaasPaymentId ?? null,
      value: order.totalCents / 100,
      currency: order.currency,
      confirmedAt: order.confirmedAt,
    };
  }

  async getPublicTicket(tenantId: string, ticketId: string) {
    const row = await this.prisma.eventTicket.findFirst({
      where: {
        tenantId,
        OR: [{ id: ticketId }, { publicCode: ticketId }],
      },
      include: {
        ticketType: { select: { name: true } },
        order: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                timeStart: true,
                location: true,
              },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Bilhete não encontrado');
    }
    const event = row.order.event;
    const startsAt = this.buildStartsAtIso(event.date, event.timeStart);
    return {
      id: row.id,
      publicCode: row.publicCode,
      status: row.status,
      event: {
        id: event.id,
        title: event.title,
        startsAt,
        venueName: event.location,
      },
      ticketTypeName: row.ticketType.name,
      holderName: row.holderName,
      orderId: row.orderId,
    };
  }

  async fulfillConfirmedOrder(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const order = await tx.eventOrder.findUnique({
      where: { id: orderId },
      include: {
        lines: true,
        payer: { select: { name: true } },
      },
    });
    if (!order || order.status === 'CONFIRMED') {
      return;
    }

    const payerName = order.payer?.name ?? 'Participante';
    const ticketsData: Prisma.EventTicketCreateManyInput[] = [];

    for (const line of order.lines) {
      for (let i = 0; i < line.quantity; i++) {
        const named = line.holderNames[i]?.trim();
        ticketsData.push({
          tenantId: order.tenantId,
          orderId: order.id,
          ticketTypeId: line.ticketTypeId,
          publicCode: generatePublicCode(),
          holderName: named && named.length > 0 ? named : payerName,
        });
      }
    }

    if (ticketsData.length > 0) {
      await tx.eventTicket.createMany({ data: ticketsData });
    }

    await tx.eventOrder.update({
      where: { id: order.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
  }

  async markOrderFailed(
    orderId: string,
    tx: Prisma.TransactionClient,
    status: EventOrderStatus = 'FAILED',
  ): Promise<void> {
    const order = await tx.eventOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order || order.status === 'CONFIRMED') {
      return;
    }
    if (order.status === status) {
      return;
    }

    for (const line of order.lines) {
      await this.ticketTypes.releaseStock(tx, line.ticketTypeId, line.quantity);
    }

    await tx.eventOrder.update({
      where: { id: order.id },
      data: { status },
    });
  }

  async afterTransactionsConfirmed(
    tenantId: string,
    eventOrderIds: string[],
  ): Promise<void> {
    for (const orderId of eventOrderIds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.fulfillConfirmedOrder(orderId, tx);
        });
      } catch (err) {
        this.logger.error(`Falha ao emitir bilhetes do pedido ${orderId}`, err);
      }
    }
  }

  private mapOrderPaymentStatus(
    orderStatus: EventOrderStatus,
    txStatus: string | undefined,
  ): string {
    if (orderStatus === 'CONFIRMED') return 'CONFIRMED';
    if (orderStatus === 'FAILED') return 'FAILED';
    if (orderStatus === 'EXPIRED') return 'EXPIRED';
    if (orderStatus === 'CANCELLED') return 'FAILED';
    if (txStatus === 'CONFIRMED') return 'CONFIRMED';
    return 'PENDING';
  }

  private buildStartsAtIso(date: Date, timeStart: Date | null): string {
    const day = formatDateOnly(date);
    if (!timeStart) {
      return new Date(`${day}T12:00:00.000Z`).toISOString();
    }
    const time = formatTimeOnly(timeStart)!;
    const [h, m, s] = time.split(':').map(Number);
    const d = new Date(`${day}T00:00:00.000Z`);
    d.setUTCHours(h, m, s ?? 0, 0);
    return d.toISOString();
  }
}
