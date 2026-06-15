import { Injectable, NotFoundException } from '@nestjs/common';
import { EventTicketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventTicketTypeDto } from './dto/create-event-ticket-type.dto';
import { UpdateEventTicketTypeDto } from './dto/update-event-ticket-type.dto';
import {
  isTicketTypeOnSale,
  quantityRemaining,
} from './event-stock.util';

@Injectable()
export class EventTicketTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: EventTicketType) {
    const remaining = quantityRemaining(row);
    return {
      id: row.id,
      eventId: row.eventId,
      name: row.name,
      description: row.description,
      priceCents: row.priceCents,
      feeCents: row.feeCents,
      quantityTotal: row.quantityTotal,
      quantitySold: row.quantitySold,
      quantityRemaining: remaining,
      minPerOrder: row.minPerOrder,
      maxPerOrder: row.maxPerOrder,
      salesOpensAt: row.salesOpensAt,
      salesClosesAt: row.salesClosesAt,
      isSoldOut: remaining !== null && remaining <= 0,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPublicDto(row: EventTicketType) {
    const remaining = quantityRemaining(row);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      priceCents: row.priceCents,
      feeCents: row.feeCents,
      quantityTotal: row.quantityTotal,
      quantityRemaining: remaining,
      minPerOrder: row.minPerOrder,
      maxPerOrder: row.maxPerOrder,
      salesOpensAt: row.salesOpensAt,
      salesClosesAt: row.salesClosesAt,
      isSoldOut:
        !isTicketTypeOnSale(row) ||
        (remaining !== null && remaining <= 0),
    };
  }

  async listForEvent(tenantId: string, eventId: string) {
    await this.assertEvent(tenantId, eventId);
    const rows = await this.prisma.eventTicketType.findMany({
      where: { tenantId, eventId },
      orderBy: { priceCents: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async listPublicForEvent(tenantId: string, eventId: string, currency: string) {
    await this.assertPublishedEvent(tenantId, eventId);
    const rows = await this.prisma.eventTicketType.findMany({
      where: { tenantId, eventId, active: true },
      orderBy: { priceCents: 'asc' },
    });
    return {
      eventId,
      currency,
      ticketTypes: rows
        .filter((row) => isTicketTypeOnSale(row))
        .map((row) => this.toPublicDto(row)),
    };
  }

  async createForEvent(
    tenantId: string,
    eventId: string,
    dto: CreateEventTicketTypeDto,
  ) {
    await this.assertEvent(tenantId, eventId);
    const row = await this.prisma.eventTicketType.create({
      data: {
        tenantId,
        eventId,
        name: dto.name,
        description: dto.description ?? null,
        priceCents: dto.priceCents,
        feeCents: dto.feeCents ?? 0,
        quantityTotal: dto.quantityTotal ?? null,
        minPerOrder: dto.minPerOrder ?? 1,
        maxPerOrder: dto.maxPerOrder ?? 10,
        salesOpensAt: dto.salesOpensAt ? new Date(dto.salesOpensAt) : null,
        salesClosesAt: dto.salesClosesAt ? new Date(dto.salesClosesAt) : null,
        active: dto.active ?? true,
      },
    });
    return this.toDto(row);
  }

  async updateForEvent(
    tenantId: string,
    eventId: string,
    id: string,
    dto: UpdateEventTicketTypeDto,
  ) {
    const existing = await this.prisma.eventTicketType.findFirst({
      where: { id, tenantId, eventId },
    });
    if (!existing) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    const row = await this.prisma.eventTicketType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.feeCents !== undefined ? { feeCents: dto.feeCents } : {}),
        ...(dto.quantityTotal !== undefined
          ? { quantityTotal: dto.quantityTotal }
          : {}),
        ...(dto.minPerOrder !== undefined
          ? { minPerOrder: dto.minPerOrder }
          : {}),
        ...(dto.maxPerOrder !== undefined
          ? { maxPerOrder: dto.maxPerOrder }
          : {}),
        ...(dto.salesOpensAt !== undefined
          ? {
              salesOpensAt: dto.salesOpensAt
                ? new Date(dto.salesOpensAt)
                : null,
            }
          : {}),
        ...(dto.salesClosesAt !== undefined
          ? {
              salesClosesAt: dto.salesClosesAt
                ? new Date(dto.salesClosesAt)
                : null,
            }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.toDto(row);
  }

  async removeForEvent(tenantId: string, eventId: string, id: string) {
    const existing = await this.prisma.eventTicketType.findFirst({
      where: { id, tenantId, eventId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    await this.prisma.eventTicketType.delete({ where: { id } });
    return { ok: true };
  }

  async reserveStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ticketTypeId: string,
    quantity: number,
  ): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE event_ticket_types
      SET quantity_sold = quantity_sold + ${quantity},
          updated_at = NOW()
      WHERE id = ${ticketTypeId}::uuid
        AND tenant_id = ${tenantId}::uuid
        AND active = true
        AND (quantity_total IS NULL OR quantity_sold + ${quantity} <= quantity_total)
    `;
    return affected > 0;
  }

  async releaseStock(
    tx: Prisma.TransactionClient,
    ticketTypeId: string,
    quantity: number,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE event_ticket_types
      SET quantity_sold = GREATEST(0, quantity_sold - ${quantity}),
          updated_at = NOW()
      WHERE id = ${ticketTypeId}::uuid
    `;
  }

  private async assertEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
  }

  private async assertPublishedEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, published: true },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
  }
}
