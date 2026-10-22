import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SITE_SECTIONS,
  findSectionSpec,
  type SiteSectionSpec,
} from './site-content.registry';
import { validateSectionValue } from './site-content.validation';
import { SiteRevalidationService } from './site-revalidation.service';

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
export class SiteContentService implements OnModuleInit {
  private readonly logger = new Logger(SiteContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

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
    const [sections, branches, pastors, ministries, config] = await Promise.all([
      this.listForTenant(tenantId),
      this.prisma.churchBranch.findMany({
        where: { tenantId, active: true },
        orderBy: [
          { isHeadquarters: 'desc' },
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      }),
      this.prisma.pastor.findMany({
        where: { tenantId, active: true },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      }),
      this.prisma.ministry.findMany({
        where: { tenantId, active: true },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      }),
      this.prisma.churchConfig.findUnique({
        where: { tenantId },
      }),
    ]);

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

    // Map list items
    const branchItems = branches.map((b) => ({
      name: b.name,
      location: b.location ?? '',
      address: b.address ?? '',
      image: b.image ?? '',
      mapsUrl: b.mapsUrl ?? '',
      isHeadquarters: b.isHeadquarters,
      active: b.active,
    }));

    const pastorItems = pastors.map((p) => ({
      name: p.name,
      image: p.image ?? '',
      active: p.active,
    }));

    const ministryItems = ministries.map((m) => ({
      name: m.name,
      description: m.description ?? '',
      icon: m.icon ?? '',
      image: m.image ?? '',
      active: m.active,
    }));

    // Inject list items
    if (out.churches) {
      out.churches.items = branchItems;
    }
    if (out.pastors) {
      out.pastors.items = pastorItems;
    }
    out.ministries = {
      items: ministryItems,
    };

    // Fonte oficial: ChurchConfig. Com a linha criada, campo limpo (null) sai
    // vazio; o JSON legado só vale enquanto o tenant ainda não tem ChurchConfig.
    const pick = (
      section: string,
      field: string,
      fromConfig: string | null | undefined,
    ): string => {
      if (config) return fromConfig ?? '';
      return (out[section]?.[field] as string | undefined) ?? '';
    };

    if (out.giving) {
      out.giving = {
        ...out.giving,
        pixKey: pick('giving', 'pixKey', config?.pixKey),
        bankName: pick('giving', 'bankName', config?.bankName),
        bankCode: pick('giving', 'bankCode', config?.bankCode),
        agency: pick('giving', 'agency', config?.agency),
        account: pick('giving', 'account', config?.account),
        holderName: pick('giving', 'holderName', config?.holderName),
        holderDocument: pick('giving', 'holderDocument', config?.holderDocument),
      };
    }

    if (out.contact) {
      out.contact = {
        ...out.contact,
        phone: pick('contact', 'phone', config?.phone),
        email: pick('contact', 'email', config?.email),
        address: pick('contact', 'address', config?.address),
        youtubeUrl: pick('contact', 'youtubeUrl', config?.youtubeUrl),
        instagramUrl: pick('contact', 'instagramUrl', config?.instagramUrl),
        facebookUrl: pick('contact', 'facebookUrl', config?.facebookUrl),
      };
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

    this.siteRevalidation.notifyContentChanged(tenantId);

    return this.toDto(section, row.value, row.updatedAt);
  }

  /** Repõe a secção no conteúdo inicial do registry. */
  async resetForTenant(tenantId: string, key: string): Promise<SiteSectionDto> {
    const section = this.requireSection(key);
    await this.prisma.siteContent.deleteMany({ where: { tenantId, key } });
    this.siteRevalidation.notifyContentChanged(tenantId);
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

  /**
   * Migração legada (listas e config que antes viviam em `site_content`).
   * Estritamente aditiva: só insere nas tabelas do tenant quando estão vazias
   * e nunca altera nem apaga `site_content`. Idempotente — pode rodar a cada
   * boot. Uma transação por tenant; falha num tenant não impede os demais.
   */
  async onModuleInit() {
    let tenants: { id: string }[];
    try {
      tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    } catch (err) {
      this.logger.error('Migração legada do Site não executou', err as Error);
      return;
    }

    for (const { id: tenantId } of tenants) {
      try {
        const migrated = await this.prisma.$transaction((tx) =>
          this.migrateTenantLegacyData(tx, tenantId),
        );
        if (migrated.length > 0) {
          this.logger.log(`Migração legada [${tenantId}]: ${migrated.join(', ')}`);
        }
      } catch (err) {
        this.logger.error(
          `Migração legada [${tenantId}] revertida`,
          err as Error,
        );
      }
    }
  }

  /** Devolve o que foi migrado neste tenant (vazio = nada a fazer). */
  private async migrateTenantLegacyData(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string[]> {
    const rows = await tx.siteContent.findMany({ where: { tenantId } });
    const legacy = (key: string): Record<string, any> | null => {
      const value = rows.find((r) => r.key === key)?.value;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, any>)
        : null;
    };
    const items = (key: string): any[] => {
      const list = legacy(key)?.items;
      return Array.isArray(list) ? list : [];
    };
    const migrated: string[] = [];

    const branches = items('churches');
    if (branches.length > 0 && (await tx.churchBranch.count({ where: { tenantId } })) === 0) {
      await tx.churchBranch.createMany({
        data: branches.map((item, index) => ({
          tenantId,
          name: item.name ?? 'Filial',
          location: item.location ?? null,
          address: item.address ?? null,
          image: item.image ?? null,
          mapsUrl: item.mapsUrl ?? null,
          isHeadquarters: item.isHeadquarters ?? false,
          active: item.active ?? true,
          sortOrder: index,
        })),
      });
      migrated.push(`${branches.length} filiais`);
    }

    const pastors = items('pastors');
    if (pastors.length > 0 && (await tx.pastor.count({ where: { tenantId } })) === 0) {
      await tx.pastor.createMany({
        data: pastors.map((item, index) => ({
          tenantId,
          name: item.name ?? 'Pastor',
          image: item.image ?? null,
          active: item.active ?? true,
          sortOrder: index,
        })),
      });
      migrated.push(`${pastors.length} pastores`);
    }

    const ministries = items('ministries');
    if (ministries.length > 0 && (await tx.ministry.count({ where: { tenantId } })) === 0) {
      await tx.ministry.createMany({
        data: ministries.map((item, index) => ({
          tenantId,
          name: item.name ?? 'Ministério',
          description: item.description ?? null,
          icon: item.icon ?? null,
          image: item.image ?? null,
          active: item.active ?? true,
          sortOrder: index,
        })),
      });
      migrated.push(`${ministries.length} ministérios`);
    }

    const giving = legacy('giving');
    const contact = legacy('contact');
    if ((giving || contact) && (await tx.churchConfig.count({ where: { tenantId } })) === 0) {
      await tx.churchConfig.create({
        data: {
          tenantId,
          pixKey: giving?.pixKey ?? null,
          bankName: giving?.bankName ?? null,
          bankCode: giving?.bankCode ?? null,
          agency: giving?.agency ?? null,
          account: giving?.account ?? null,
          holderName: giving?.holderName ?? null,
          holderDocument: giving?.holderDocument ?? null,
          phone: contact?.phone ?? null,
          email: contact?.email ?? null,
          address: contact?.address ?? null,
          youtubeUrl: contact?.youtubeUrl ?? null,
          instagramUrl: contact?.instagramUrl ?? null,
          facebookUrl: contact?.facebookUrl ?? null,
        },
      });
      migrated.push('configuração da igreja');
    }

    return migrated;
  }
}
