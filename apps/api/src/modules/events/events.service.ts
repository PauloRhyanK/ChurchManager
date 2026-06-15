import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  parseDateOnly,
  parseTimeOnly,
  startOfTodayUtc,
  toEventDto,
} from './event-format.util';

export type ListEventsOptions = {
  publishedOnly?: boolean;
  upcomingOnly?: boolean;
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string, options: ListEventsOptions = {}) {
    const where: Prisma.EventWhereInput = { tenantId };
    if (options.publishedOnly) {
      where.published = true;
    }
    if (options.upcomingOnly) {
      where.date = { gte: startOfTodayUtc() };
    }
    const rows = await this.prisma.event.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => toEventDto(row));
  }

  async getForTenant(tenantId: string, id: string) {
    const row = await this.prisma.event.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Evento não encontrado');
    }
    return toEventDto(row);
  }

  /** Detalhe público — sem filtro published (compatível com site legado). */
  async getPublicByTenant(tenantId: string, id: string) {
    const row = await this.prisma.event.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Evento não encontrado');
    }
    return toEventDto(row);
  }

  async createForTenant(tenantId: string, dto: CreateEventDto) {
    const row = await this.prisma.event.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description ?? null,
        date: parseDateOnly(dto.date),
        timeStart: parseTimeOnly(dto.timeStart),
        timeEnd: parseTimeOnly(dto.timeEnd),
        location: dto.location ?? null,
        imageUrl: dto.imageUrl ?? null,
        tag: dto.tag ?? null,
        published: dto.published ?? true,
      },
    });
    return toEventDto(row);
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Evento não encontrado');
    }

    const row = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.date !== undefined ? { date: parseDateOnly(dto.date) } : {}),
        ...(dto.timeStart !== undefined
          ? { timeStart: parseTimeOnly(dto.timeStart) }
          : {}),
        ...(dto.timeEnd !== undefined
          ? { timeEnd: parseTimeOnly(dto.timeEnd) }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.tag !== undefined ? { tag: dto.tag } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
      },
    });
    return toEventDto(row);
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Evento não encontrado');
    }
    await this.prisma.event.delete({ where: { id } });
    return { ok: true };
  }
}
