import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionEntryDto } from './dto/permission-group.dto';

@Injectable()
export class PermissionGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.permissionGroup.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        entries: true,
        _count: { select: { members: true } },
      },
    });
    return rows.map((row) => this.toDto(row));
  }

  async getForTenant(tenantId: string, id: string) {
    const row = await this.prisma.permissionGroup.findFirst({
      where: { id, tenantId },
      include: {
        entries: true,
        _count: { select: { members: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Grupo de permissões não encontrado');
    }
    return this.toDto(row);
  }

  async createForTenant(
    tenantId: string,
    data: {
      name: string;
      description?: string | null;
      entries: PermissionEntryDto[];
    },
  ) {
    const entries = this.normalizeEntries(data.entries);
    try {
      const row = await this.prisma.permissionGroup.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description ?? null,
          entries: { create: entries },
        },
        include: {
          entries: true,
          _count: { select: { members: true } },
        },
      });
      return this.toDto(row);
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      description?: string | null;
      entries?: PermissionEntryDto[];
    },
  ) {
    const existing = await this.prisma.permissionGroup.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Grupo de permissões não encontrado');
    }
    const entries =
      data.entries === undefined
        ? undefined
        : this.normalizeEntries(data.entries);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (entries !== undefined) {
          await tx.permissionGroupEntry.deleteMany({ where: { groupId: id } });
        }
        return tx.permissionGroup.update({
          where: { id },
          data: {
            name: data.name,
            description:
              data.description === undefined ? undefined : data.description,
            ...(entries !== undefined
              ? { entries: { create: entries } }
              : {}),
          },
          include: {
            entries: true,
            _count: { select: { members: true } },
          },
        });
      });
      return this.toDto(row);
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.permissionGroup.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Grupo de permissões não encontrado');
    }
    await this.prisma.permissionGroup.delete({ where: { id } });
    return { ok: true };
  }

  /** Valida que os ids pertencem ao tenant; devolve os ids válidos. */
  async assertGroupsBelongToTenant(
    tenantId: string,
    groupIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(groupIds)];
    if (unique.length === 0) return [];
    const found = await this.prisma.permissionGroup.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Um ou mais grupos de permissões são inválidos.',
      );
    }
    return unique;
  }

  private normalizeEntries(entries: PermissionEntryDto[]) {
    const byModule = new Map<string, PermissionEntryDto>();
    for (const entry of entries) {
      byModule.set(entry.module, entry);
    }
    return [...byModule.values()].map((e) => ({
      module: e.module,
      level: e.level,
    }));
  }

  private mapUniqueError(e: unknown): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new BadRequestException('Já existe um grupo com este nome.');
    }
    return e;
  }

  private toDto(row: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    entries: { module: string; level: string }[];
    _count: { members: number };
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      entries: row.entries.map((e) => ({ module: e.module, level: e.level })),
      memberCount: row._count.members,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
