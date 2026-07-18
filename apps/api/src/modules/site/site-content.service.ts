import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SITE_SECTIONS,
  findSectionSpec,
  type SiteSectionSpec,
} from './site-content.registry';
import { validateSectionValue } from './site-content.validation';

export interface SiteSectionDto {
  key: string;
  title: string;
  description: string;
  icon: string;
  value: Record<string, unknown>;
  /** null enquanto a secção nunca foi editada (está a servir os defaults). */
  updatedAt: string | null;
}

@Injectable()
export class SiteContentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devolve sempre as secções todas do registry. As que ainda não foram
   * gravadas saem com os defaults, para o site nunca ficar sem conteúdo.
   */
  async listForTenant(tenantId: string): Promise<SiteSectionDto[]> {
    const rows = await this.prisma.siteContent.findMany({
      where: { tenantId },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return SITE_SECTIONS.map((section) => {
      const row = byKey.get(section.key);
      return this.toDto(section, row?.value, row?.updatedAt);
    });
  }

  /**
   * Versão para o site público: mapa `key -> value`, já sem os itens de lista
   * marcados como `active: false`.
   */
  async listPublicForTenant(
    tenantId: string,
  ): Promise<Record<string, Record<string, unknown>>> {
    const sections = await this.listForTenant(tenantId);
    const out: Record<string, Record<string, unknown>> = {};

    for (const section of sections) {
      const value: Record<string, unknown> = {};
      for (const [field, fieldValue] of Object.entries(section.value)) {
        value[field] = Array.isArray(fieldValue)
          ? fieldValue.filter(
              (item) =>
                !(
                  typeof item === 'object' &&
                  item !== null &&
                  (item as Record<string, unknown>).active === false
                ),
            )
          : fieldValue;
      }
      out[section.key] = value;
    }

    return out;
  }

  async getForTenant(tenantId: string, key: string): Promise<SiteSectionDto> {
    const section = this.requireSection(key);
    const row = await this.prisma.siteContent.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    return this.toDto(section, row?.value, row?.updatedAt);
  }

  async updateForTenant(
    tenantId: string,
    key: string,
    rawValue: unknown,
  ): Promise<SiteSectionDto> {
    const section = this.requireSection(key);
    const value = validateSectionValue(section, rawValue);

    const row = await this.prisma.siteContent.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });

    return this.toDto(section, row.value, row.updatedAt);
  }

  /** Repõe a secção no conteúdo inicial do registry. */
  async resetForTenant(tenantId: string, key: string): Promise<SiteSectionDto> {
    const section = this.requireSection(key);
    await this.prisma.siteContent.deleteMany({ where: { tenantId, key } });
    return this.toDto(section, undefined, undefined);
  }

  private requireSection(key: string): SiteSectionSpec {
    const section = findSectionSpec(key);
    if (!section) {
      throw new NotFoundException(`Secção de conteúdo "${key}" não existe`);
    }
    return section;
  }

  /**
   * Mescla o valor gravado por cima dos defaults. Campos acrescentados ao
   * registry depois da última gravação aparecem preenchidos em vez de vazios.
   */
  private toDto(
    section: SiteSectionSpec,
    stored: unknown,
    updatedAt: Date | undefined,
  ): SiteSectionDto {
    const value =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? { ...section.defaults, ...(stored as Record<string, unknown>) }
        : { ...section.defaults };

    return {
      key: section.key,
      title: section.title,
      description: section.description,
      icon: section.icon,
      value,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
    };
  }
}
