import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventTicketTypeDto } from './dto/create-event-ticket-type.dto';
import { UpdateEventTicketTypeDto } from './dto/update-event-ticket-type.dto';
import { TicketFieldConfigDto } from './dto/ticket-field-config.dto';
import { isTicketTypeOnSale, quantityRemaining } from './event-stock.util';

const DEFAULT_BILLING_TYPES = ['PIX', 'BOLETO', 'CREDIT_CARD'];

const ticketWithFields = {
  include: { fieldConfigs: { include: { field: true } } },
} satisfies Prisma.EventTicketTypeDefaultArgs;

type TicketWithFields = Prisma.EventTicketTypeGetPayload<typeof ticketWithFields>;

@Injectable()
export class EventTicketTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapFieldConfigs(row: TicketWithFields) {
    return row.fieldConfigs
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((fc) => ({
        fieldId: fc.fieldId,
        key: fc.field.key,
        label: fc.field.label,
        type: fc.field.type,
        options: (fc.field.options as string[] | null) ?? null,
        isSystem: fc.field.isSystem,
        enabled: fc.enabled,
        required: fc.required,
        sortOrder: fc.sortOrder,
      }));
  }

  private toDto(row: TicketWithFields) {
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
      visibility: row.visibility,
      allowGuestRegistration: row.allowGuestRegistration,
      communityLink: row.communityLink,
      allowedBillingTypes: row.allowedBillingTypes,
      maxInstallments: row.maxInstallments,
      isSoldOut: remaining !== null && remaining <= 0,
      active: row.active,
      fields: this.mapFieldConfigs(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPublicDto(row: TicketWithFields) {
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
      visibility: row.visibility,
      allowGuestRegistration: row.allowGuestRegistration,
      communityLink: row.communityLink,
      allowedBillingTypes: row.allowedBillingTypes,
      maxInstallments: row.maxInstallments,
      isSoldOut:
        !isTicketTypeOnSale(row) || (remaining !== null && remaining <= 0),
      fields: this.mapFieldConfigs(row)
        .filter((f) => f.enabled)
        .map((f) => ({
          fieldId: f.fieldId,
          key: f.key,
          label: f.label,
          type: f.type,
          options: f.options,
          required: f.required,
        })),
    };
  }

  async listForEvent(tenantId: string, eventId: string) {
    await this.assertEvent(tenantId, eventId);
    const rows = await this.prisma.eventTicketType.findMany({
      where: { tenantId, eventId },
      orderBy: { priceCents: 'asc' },
      ...ticketWithFields,
    });
    return rows.map((row) => this.toDto(row));
  }

  async listPublicForEvent(tenantId: string, eventId: string, currency: string) {
    await this.assertPublishedEvent(tenantId, eventId);
    const rows = await this.prisma.eventTicketType.findMany({
      where: { tenantId, eventId, active: true, visibility: 'PUBLIC' },
      orderBy: { priceCents: 'asc' },
      ...ticketWithFields,
    });
    return {
      eventId,
      currency,
      ticketTypes: rows
        .filter((row) => isTicketTypeOnSale(row))
        .map((row) => this.toPublicDto(row)),
    };
  }

  /** Ingresso público por id — inclui PRIVATE (link directo). */
  async getPublicById(tenantId: string, eventId: string, id: string) {
    await this.assertPublishedEvent(tenantId, eventId);
    const row = await this.prisma.eventTicketType.findFirst({
      where: { id, tenantId, eventId, active: true },
      ...ticketWithFields,
    });
    if (!row) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    return this.toPublicDto(row);
  }

  async createForEvent(
    tenantId: string,
    eventId: string,
    dto: CreateEventTicketTypeDto,
  ) {
    await this.assertEvent(tenantId, eventId);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eventTicketType.create({
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
          visibility: dto.visibility ?? 'PUBLIC',
          allowGuestRegistration: dto.allowGuestRegistration ?? true,
          communityLink: dto.communityLink ?? null,
          allowedBillingTypes: dto.allowedBillingTypes ?? DEFAULT_BILLING_TYPES,
          maxInstallments: dto.maxInstallments ?? null,
          active: dto.active ?? true,
        },
        select: { id: true },
      });
      if (dto.fieldConfigs) {
        await this.syncFieldConfigs(tx, tenantId, created.id, dto.fieldConfigs);
      }
      return created.id;
    });
    return this.getById(tenantId, eventId, id);
  }

  async updateForEvent(
    tenantId: string,
    eventId: string,
    id: string,
    dto: UpdateEventTicketTypeDto,
  ) {
    const existing = await this.prisma.eventTicketType.findFirst({
      where: { id, tenantId, eventId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTicketType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.priceCents !== undefined
            ? { priceCents: dto.priceCents }
            : {}),
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
          ...(dto.visibility !== undefined
            ? { visibility: dto.visibility }
            : {}),
          ...(dto.allowGuestRegistration !== undefined
            ? { allowGuestRegistration: dto.allowGuestRegistration }
            : {}),
          ...(dto.communityLink !== undefined
            ? { communityLink: dto.communityLink }
            : {}),
          ...(dto.allowedBillingTypes !== undefined
            ? { allowedBillingTypes: dto.allowedBillingTypes }
            : {}),
          ...(dto.maxInstallments !== undefined
            ? { maxInstallments: dto.maxInstallments }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      if (dto.fieldConfigs !== undefined) {
        await this.syncFieldConfigs(tx, tenantId, id, dto.fieldConfigs);
      }
    });
    return this.getById(tenantId, eventId, id);
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

  /** Clona um tipo de ingresso (config + campos), zerando vendas. */
  async duplicateForEvent(tenantId: string, eventId: string, id: string) {
    const source = await this.prisma.eventTicketType.findFirst({
      where: { id, tenantId, eventId },
      ...ticketWithFields,
    });
    if (!source) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    const newId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eventTicketType.create({
        data: {
          tenantId,
          eventId,
          name: `${source.name} (cópia)`,
          description: source.description,
          priceCents: source.priceCents,
          feeCents: source.feeCents,
          quantityTotal: source.quantityTotal,
          minPerOrder: source.minPerOrder,
          maxPerOrder: source.maxPerOrder,
          salesOpensAt: source.salesOpensAt,
          salesClosesAt: source.salesClosesAt,
          visibility: source.visibility,
          allowGuestRegistration: source.allowGuestRegistration,
          communityLink: source.communityLink,
          allowedBillingTypes: source.allowedBillingTypes,
          maxInstallments: source.maxInstallments,
          active: source.active,
        },
        select: { id: true },
      });
      if (source.fieldConfigs.length > 0) {
        await tx.eventTicketTypeField.createMany({
          data: source.fieldConfigs.map((fc) => ({
            ticketTypeId: created.id,
            fieldId: fc.fieldId,
            enabled: fc.enabled,
            required: fc.required,
            sortOrder: fc.sortOrder,
          })),
        });
      }
      return created.id;
    });
    return this.getById(tenantId, eventId, newId);
  }

  async getById(tenantId: string, eventId: string, id: string) {
    const row = await this.prisma.eventTicketType.findFirst({
      where: { id, tenantId, eventId },
      ...ticketWithFields,
    });
    if (!row) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    return this.toDto(row);
  }

  private async syncFieldConfigs(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ticketTypeId: string,
    configs: TicketFieldConfigDto[],
  ) {
    await tx.eventTicketTypeField.deleteMany({ where: { ticketTypeId } });
    if (configs.length === 0) return;
    const fieldIds = configs.map((c) => c.fieldId);
    const validFields = await tx.eventFieldDefinition.findMany({
      where: { tenantId, id: { in: fieldIds } },
      select: { id: true },
    });
    const validIds = new Set(validFields.map((f) => f.id));
    const data = configs
      .filter((c) => validIds.has(c.fieldId))
      .map((c, index) => ({
        ticketTypeId,
        fieldId: c.fieldId,
        enabled: c.enabled ?? true,
        required: c.required ?? false,
        sortOrder: c.sortOrder ?? index,
      }));
    if (data.length > 0) {
      await tx.eventTicketTypeField.createMany({ data });
    }
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
