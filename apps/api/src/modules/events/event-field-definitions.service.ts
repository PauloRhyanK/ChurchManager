import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventFieldDefinition, EventFieldType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateEventFieldDefinitionDto,
  UpdateEventFieldDefinitionDto,
} from './dto/event-field-definition.dto';
import { slugifyTag } from './event-tags.service';

/** Campos padrão garantidos para cada tenant (lazy). */
const DEFAULT_FIELDS: Array<{
  key: string;
  label: string;
  type: EventFieldType;
}> = [
  { key: 'name', label: 'Nome completo', type: 'TEXT' },
  { key: 'email', label: 'E-mail', type: 'EMAIL' },
  { key: 'phone', label: 'Telefone', type: 'PHONE' },
  { key: 'cpf', label: 'CPF', type: 'CPF' },
];

@Injectable()
export class EventFieldDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: EventFieldDefinition) {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      type: row.type,
      options: (row.options as string[] | null) ?? null,
      isSystem: row.isSystem,
      createdAt: row.createdAt,
    };
  }

  /** Cria os campos padrão se ainda não existirem (idempotente). */
  async ensureDefaults(tenantId: string) {
    for (const field of DEFAULT_FIELDS) {
      await this.prisma.eventFieldDefinition.upsert({
        where: { tenantId_key: { tenantId, key: field.key } },
        create: {
          tenantId,
          key: field.key,
          label: field.label,
          type: field.type,
          isSystem: true,
        },
        update: {},
      });
    }
  }

  async listForTenant(tenantId: string) {
    await this.ensureDefaults(tenantId);
    const rows = await this.prisma.eventFieldDefinition.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async createForTenant(tenantId: string, dto: CreateEventFieldDefinitionDto) {
    const baseKey = `custom_${slugifyTag(dto.label).replace(/-/g, '_')}`;
    if (baseKey === 'custom_') {
      throw new BadRequestException('Rótulo do campo inválido');
    }
    const key = await this.uniqueKey(tenantId, baseKey);
    const row = await this.prisma.eventFieldDefinition.create({
      data: {
        tenantId,
        key,
        label: dto.label,
        type: dto.type,
        options: this.normalizeOptions(dto.type, dto.options),
        isSystem: false,
      },
    });
    return this.toDto(row);
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateEventFieldDefinitionDto,
  ) {
    const existing = await this.prisma.eventFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Campo não encontrado');
    }
    if (existing.isSystem && dto.type !== undefined && dto.type !== existing.type) {
      throw new BadRequestException('Não é possível alterar o tipo de um campo padrão');
    }
    const nextType = dto.type ?? existing.type;
    const row = await this.prisma.eventFieldDefinition.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.options !== undefined
          ? { options: this.normalizeOptions(nextType, dto.options) }
          : {}),
      },
    });
    return this.toDto(row);
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.eventFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Campo não encontrado');
    }
    if (existing.isSystem) {
      throw new BadRequestException('Campos padrão não podem ser removidos');
    }
    await this.prisma.eventFieldDefinition.delete({ where: { id } });
    return { ok: true };
  }

  private normalizeOptions(
    type: EventFieldType,
    options?: string[],
  ): string[] | undefined {
    if (type !== 'SELECT') return undefined;
    const cleaned = (options ?? [])
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (cleaned.length === 0) {
      throw new BadRequestException('Campo SELECT requer ao menos uma opção');
    }
    return cleaned;
  }

  private async uniqueKey(tenantId: string, baseKey: string): Promise<string> {
    let key = baseKey;
    let suffix = 1;
    while (
      await this.prisma.eventFieldDefinition.findUnique({
        where: { tenantId_key: { tenantId, key } },
        select: { id: true },
      })
    ) {
      suffix += 1;
      key = `${baseKey}_${suffix}`;
    }
    return key;
  }
}
