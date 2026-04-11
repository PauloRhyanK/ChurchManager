import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePublicWebOrigin } from './public-web-origin.util';

const SLUG_CACHE_TTL_MS = 60_000;

interface SlugCacheEntry {
  origins: readonly string[];
  expiresAt: number;
}

@Injectable()
export class TenantPublicWebOriginService {
  private readonly slugCache = new Map<string, SlugCacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** Normaliza para `scheme://host[:port]` (sem path). Ver `parsePublicWebOrigin`. */
  normalizeOrigin(raw: string): string {
    return parsePublicWebOrigin(raw);
  }

  async listForTenant(tenantId: string) {
    return this.prisma.tenantPublicWebOrigin.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, origin: true, createdAt: true },
    });
  }

  async createForTenant(tenantId: string, tenantSlug: string, raw: string) {
    const origin = this.normalizeOrigin(raw);
    try {
      const row = await this.prisma.tenantPublicWebOrigin.create({
        data: { tenantId, origin },
        select: { id: true, origin: true, createdAt: true },
      });
      this.invalidateSlug(tenantSlug);
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Esta origem já está registada.');
      }
      throw e;
    }
  }

  async deleteForTenant(tenantId: string, tenantSlug: string, id: string) {
    try {
      await this.prisma.tenantPublicWebOrigin.delete({
        where: { id, tenantId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Origem não encontrada.');
      }
      throw e;
    }
    this.invalidateSlug(tenantSlug);
  }

  async getAllowedOriginsForSlug(slug: string): Promise<readonly string[]> {
    const hit = this.slugCache.get(slug);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.origins;
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        publicWebOrigins: { select: { origin: true } },
      },
    });
    const origins = tenant?.publicWebOrigins.map((o) => o.origin) ?? [];
    this.slugCache.set(slug, {
      origins,
      expiresAt: Date.now() + SLUG_CACHE_TTL_MS,
    });
    return origins;
  }

  invalidateSlug(slug: string): void {
    this.slugCache.delete(slug);
  }
}
