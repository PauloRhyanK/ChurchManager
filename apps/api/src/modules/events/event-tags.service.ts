import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export function slugifyTag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class EventTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.eventTag.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { events: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      usageCount: row._count.events,
      createdAt: row.createdAt,
    }));
  }

  /** Cria (ou devolve existente) uma tag por nome. Idempotente por slug. */
  async createForTenant(tenantId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Nome da etiqueta vazio');
    }
    const slug = slugifyTag(trimmed);
    if (!slug) {
      throw new BadRequestException('Nome da etiqueta inválido');
    }
    const row = await this.prisma.eventTag.upsert({
      where: { tenantId_slug: { tenantId, slug } },
      create: { tenantId, name: trimmed, slug },
      update: {},
    });
    return { id: row.id, name: row.name, slug: row.slug };
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.eventTag.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Etiqueta não encontrada');
    }
    await this.prisma.eventTag.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Garante que as tags (por nome) existem e devolve os respectivos ids,
   * deduplicando por slug. Usado ao criar/editar eventos.
   */
  async ensureTagIds(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    names: string[],
  ): Promise<string[]> {
    const bySlug = new Map<string, string>();
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const slug = slugifyTag(name);
      if (!slug || bySlug.has(slug)) continue;
      bySlug.set(slug, name);
    }
    const ids: string[] = [];
    for (const [slug, name] of bySlug) {
      const row = await client.eventTag.upsert({
        where: { tenantId_slug: { tenantId, slug } },
        create: { tenantId, name, slug },
        update: {},
        select: { id: true },
      });
      ids.push(row.id);
    }
    return ids;
  }

  /** Substitui as associações de tags de um evento. */
  async setEventTags(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    eventId: string,
    names: string[],
  ): Promise<void> {
    const tagIds = await this.ensureTagIds(client, tenantId, names);
    await client.eventTagOnEvent.deleteMany({ where: { eventId } });
    if (tagIds.length > 0) {
      await client.eventTagOnEvent.createMany({
        data: tagIds.map((tagId) => ({ eventId, tagId })),
        skipDuplicates: true,
      });
    }
  }
}
