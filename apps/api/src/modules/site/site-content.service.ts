import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
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

    // Merge giving configurations
    const defaultGiving = sections.find((s) => s.key === 'giving')?.value ?? {};
    if (out.giving) {
      out.giving = {
        ...out.giving,
        pixKey: config?.pixKey ?? (defaultGiving.pixKey as string) ?? '',
        bankName: config?.bankName ?? (defaultGiving.bankName as string) ?? '',
        bankCode: config?.bankCode ?? (defaultGiving.bankCode as string) ?? '',
        agency: config?.agency ?? (defaultGiving.agency as string) ?? '',
        account: config?.account ?? (defaultGiving.account as string) ?? '',
        holderName: config?.holderName ?? (defaultGiving.holderName as string) ?? '',
        holderDocument: config?.holderDocument ?? (defaultGiving.holderDocument as string) ?? '',
      };
    }

    // Merge contact configurations
    const defaultContact = sections.find((s) => s.key === 'contact')?.value ?? {};
    if (out.contact) {
      out.contact = {
        ...out.contact,
        phone: config?.phone ?? (defaultContact.phone as string) ?? '',
        email: config?.email ?? (defaultContact.email as string) ?? '',
        address: config?.address ?? (defaultContact.address as string) ?? '',
        youtubeUrl: config?.youtubeUrl ?? (defaultContact.youtubeUrl as string) ?? '',
        instagramUrl: config?.instagramUrl ?? (defaultContact.instagramUrl as string) ?? '',
        facebookUrl: config?.facebookUrl ?? (defaultContact.facebookUrl as string) ?? '',
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

  async onModuleInit() {
    try {
      await this.migrateLegacyData();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Falha na migração automática de dados legado do Site:', err);
    }
  }

  private async migrateLegacyData() {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
    });

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // 1. Obter registros de SiteContent deste tenant
      const siteContents = await this.prisma.siteContent.findMany({
        where: { tenantId },
      });

      const churchesContent = siteContents.find((c) => c.key === 'churches');
      const pastorsContent = siteContents.find((c) => c.key === 'pastors');
      const ministriesContent = siteContents.find((c) => c.key === 'ministries');
      const givingContent = siteContents.find((c) => c.key === 'giving');
      const contactContent = siteContents.find((c) => c.key === 'contact');

      // --- Migrar Igrejas (churches) ---
      if (churchesContent && typeof churchesContent.value === 'object' && churchesContent.value !== null) {
        const value = churchesContent.value as Record<string, any>;
        if (Array.isArray(value.items) && value.items.length > 0) {
          const count = await this.prisma.churchBranch.count({ where: { tenantId } });
          if (count === 0) {
            await this.prisma.churchBranch.createMany({
              data: value.items.map((item: any, index: number) => ({
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
          }
          // Limpar do JSON
          const { items, ...cleanedValue } = value;
          await this.prisma.siteContent.update({
            where: { id: churchesContent.id },
            data: { value: cleanedValue as any },
          });
        }
      }

      // --- Migrar Pastores (pastors) ---
      if (pastorsContent && typeof pastorsContent.value === 'object' && pastorsContent.value !== null) {
        const value = pastorsContent.value as Record<string, any>;
        if (Array.isArray(value.items) && value.items.length > 0) {
          const count = await this.prisma.pastor.count({ where: { tenantId } });
          if (count === 0) {
            await this.prisma.pastor.createMany({
              data: value.items.map((item: any, index: number) => ({
                tenantId,
                name: item.name ?? 'Pastor',
                image: item.image ?? null,
                active: item.active ?? true,
                sortOrder: index,
              })),
            });
          }
          // Limpar do JSON
          const { items, ...cleanedValue } = value;
          await this.prisma.siteContent.update({
            where: { id: pastorsContent.id },
            data: { value: cleanedValue as any },
          });
        }
      }

      // --- Migrar Ministérios (ministries) ---
      if (ministriesContent && typeof ministriesContent.value === 'object' && ministriesContent.value !== null) {
        const value = ministriesContent.value as Record<string, any>;
        if (Array.isArray(value.items) && value.items.length > 0) {
          const count = await this.prisma.ministry.count({ where: { tenantId } });
          if (count === 0) {
            await this.prisma.ministry.createMany({
              data: value.items.map((item: any, index: number) => ({
                tenantId,
                name: item.name ?? 'Ministério',
                description: item.description ?? null,
                icon: item.icon ?? null,
                image: item.image ?? null,
                active: item.active ?? true,
                sortOrder: index,
              })),
            });
          }
          // Delete total do SiteContent de ministries já que só tinha items
          await this.prisma.siteContent.delete({
            where: { id: ministriesContent.id },
          });
        }
      }

      // --- Migrar Configurações Gerais, Redes Sociais e Ofertório (giving e contact) ---
      const hasGiving = givingContent && typeof givingContent.value === 'object' && givingContent.value !== null;
      const hasContact = contactContent && typeof contactContent.value === 'object' && contactContent.value !== null;

      if (hasGiving || hasContact) {
        const configCount = await this.prisma.churchConfig.count({ where: { tenantId } });
        if (configCount === 0) {
          const givingValue = hasGiving ? (givingContent.value as Record<string, any>) : {};
          const contactValue = hasContact ? (contactContent.value as Record<string, any>) : {};

          await this.prisma.churchConfig.create({
            data: {
              tenantId,
              pixKey: givingValue.pixKey ?? null,
              bankName: givingValue.bankName ?? null,
              bankCode: givingValue.bankCode ?? null,
              agency: givingValue.agency ?? null,
              account: givingValue.account ?? null,
              holderName: givingValue.holderName ?? null,
              holderDocument: givingValue.holderDocument ?? null,
              phone: contactValue.phone ?? null,
              email: contactValue.email ?? null,
              address: contactValue.address ?? null,
              youtubeUrl: contactValue.youtubeUrl ?? null,
              instagramUrl: contactValue.instagramUrl ?? null,
              facebookUrl: contactValue.facebookUrl ?? null,
            },
          });
        }

        // Limpar campos bancários do JSON de giving
        if (hasGiving) {
          const val = givingContent.value as Record<string, any>;
          const { pixKey, bankName, bankCode, agency, account, holderName, holderDocument, ...cleanedGiving } = val;
          await this.prisma.siteContent.update({
            where: { id: givingContent.id },
            data: { value: cleanedGiving as any },
          });
        }

        // Limpar contatos e redes sociais do JSON de contact
        if (hasContact) {
          const val = contactContent.value as Record<string, any>;
          const { phone, email, address, youtubeUrl, instagramUrl, facebookUrl, ...cleanedContact } = val;
          await this.prisma.siteContent.update({
            where: { id: contactContent.id },
            data: { value: cleanedContact as any },
          });
        }
      }
    }
  }
}
