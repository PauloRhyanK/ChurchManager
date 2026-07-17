import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventTagsService } from './event-tags.service';
import {
  EventTagDto,
  parseDateOnly,
  parseTimeOnly,
  startOfTodayUtc,
  toEventDto,
} from './event-format.util';

export type ListEventsOptions = {
  publishedOnly?: boolean;
  upcomingOnly?: boolean;
};

const eventWithTags = {
  include: { tags: { include: { tag: true } } },
} satisfies Prisma.EventDefaultArgs;

type EventWithTags = Prisma.EventGetPayload<typeof eventWithTags>;

function mapTags(row: EventWithTags): EventTagDto[] {
  return row.tags.map((t) => ({
    id: t.tag.id,
    name: t.tag.name,
    slug: t.tag.slug,
  }));
}

function resolveCoverImageUpdate(
  dto: UpdateEventDto,
): string | null | undefined {
  if (dto.coverImageUrl === undefined && dto.imageUrl === undefined) {
    return undefined;
  }
  if (dto.coverImageUrl !== undefined) {
    return dto.coverImageUrl;
  }
  return dto.imageUrl ?? null;
}

function uniqueCoverUrls(
  ...urls: Array<string | null | undefined>
): string[] {
  return [...new Set(urls.filter((url): url is string => Boolean(url?.trim())))];
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: EventTagsService,
    private readonly storage: StorageService,
  ) {}

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
      ...eventWithTags,
    });
    return rows.map((row) => toEventDto(row, mapTags(row)));
  }

  async listDistinctLocations(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.event.findMany({
      where: { tenantId, location: { not: null } },
      select: { location: true },
      distinct: ['location'],
      orderBy: { location: 'asc' },
    });
    return rows
      .map((row) => row.location?.trim())
      .filter((loc): loc is string => Boolean(loc));
  }

  async getForTenant(tenantId: string, id: string) {
    const row = await this.prisma.event.findFirst({
      where: { id, tenantId },
      ...eventWithTags,
    });
    if (!row) {
      throw new NotFoundException('Evento não encontrado');
    }
    return toEventDto(row, mapTags(row));
  }

  /** Detalhe público publicado (contrato M2). */
  async getPublishedForTenant(tenantId: string, id: string) {
    const row = await this.prisma.event.findFirst({
      where: { id, tenantId, published: true },
      ...eventWithTags,
    });
    if (!row) {
      throw new NotFoundException('Evento não encontrado');
    }
    return toEventDto(row, mapTags(row));
  }

  /** Detalhe público — sem filtro published (compatível com site legado). */
  async getPublicByTenant(tenantId: string, id: string) {
    const row = await this.prisma.event.findFirst({
      where: { id, tenantId },
      ...eventWithTags,
    });
    if (!row) {
      throw new NotFoundException('Evento não encontrado');
    }
    return toEventDto(row, mapTags(row));
  }

  async createForTenant(tenantId: string, dto: CreateEventDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          tenantId,
          title: dto.title,
          description: dto.description ?? null,
          format: dto.format ?? 'IN_PERSON',
          onlineUrl: dto.onlineUrl ?? null,
          shortDescription: dto.shortDescription ?? null,
          detailsHtml: dto.detailsHtml ?? null,
          videoUrl: dto.videoUrl ?? null,
          coverImageUrl: dto.coverImageUrl ?? dto.imageUrl ?? null,
          date: parseDateOnly(dto.date),
          timeStart: parseTimeOnly(dto.timeStart),
          timeEnd: parseTimeOnly(dto.timeEnd),
          location: dto.location ?? null,
          imageUrl: dto.imageUrl ?? dto.coverImageUrl ?? null,
          tag: dto.tags?.[0] ?? null,
          published: dto.published ?? true,
        },
        select: { id: true },
      });
      if (dto.tags) {
        await this.tags.setEventTags(tx, tenantId, created.id, dto.tags);
      }
      return created.id;
    });
    return this.getForTenant(tenantId, id);
  }

  async updateForTenant(tenantId: string, id: string, dto: UpdateEventDto) {
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId },
      select: { id: true, coverImageUrl: true, imageUrl: true },
    });
    if (!existing) {
      throw new NotFoundException('Evento não encontrado');
    }

    const nextCoverImageUrl = resolveCoverImageUpdate(dto);
    const previousCoverUrls = uniqueCoverUrls(
      existing.coverImageUrl,
      existing.imageUrl,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.format !== undefined ? { format: dto.format } : {}),
          ...(dto.onlineUrl !== undefined ? { onlineUrl: dto.onlineUrl } : {}),
          ...(dto.shortDescription !== undefined
            ? { shortDescription: dto.shortDescription }
            : {}),
          ...(dto.detailsHtml !== undefined
            ? { detailsHtml: dto.detailsHtml }
            : {}),
          ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl } : {}),
          ...(nextCoverImageUrl !== undefined
            ? {
                coverImageUrl: nextCoverImageUrl,
                imageUrl: nextCoverImageUrl,
              }
            : {}),
          ...(dto.date !== undefined ? { date: parseDateOnly(dto.date) } : {}),
          ...(dto.timeStart !== undefined
            ? { timeStart: parseTimeOnly(dto.timeStart) }
            : {}),
          ...(dto.timeEnd !== undefined
            ? { timeEnd: parseTimeOnly(dto.timeEnd) }
            : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.tags !== undefined ? { tag: dto.tags[0] ?? null } : {}),
          ...(dto.published !== undefined ? { published: dto.published } : {}),
        },
      });
      if (dto.tags !== undefined) {
        await this.tags.setEventTags(tx, tenantId, id, dto.tags);
      }
    });

    if (nextCoverImageUrl !== undefined) {
      const urlsToDelete = previousCoverUrls.filter(
        (url) => url !== nextCoverImageUrl,
      );
      await Promise.all(
        urlsToDelete.map((url) => this.storage.deleteFileByPublicUrl(url)),
      );
    }

    return this.getForTenant(tenantId, id);
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
