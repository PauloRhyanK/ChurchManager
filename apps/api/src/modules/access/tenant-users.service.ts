import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminUserStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionGroupsService } from './permission-groups.service';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  approvedAt: true,
  createdAt: true,
  permissionGroups: {
    select: { group: { select: { id: true, name: true } } },
  },
} satisfies Prisma.AdminUserSelect;

type UserRow = Prisma.AdminUserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class TenantUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: PermissionGroupsService,
  ) {}

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.adminUser.findMany({
      where: {
        tenantId,
        status: {
          notIn: [AdminUserStatus.PENDING_APPROVAL, AdminUserStatus.INVITED],
        },
      },
      orderBy: [{ status: 'asc' }, { email: 'asc' }],
      select: userSelect,
    });
    return rows.map((row) => this.toDto(row));
  }

  async listPendingForTenant(tenantId: string) {
    const rows = await this.prisma.adminUser.findMany({
      where: {
        tenantId,
        status: {
          in: [AdminUserStatus.PENDING_APPROVAL, AdminUserStatus.INVITED],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: userSelect,
    });
    return rows.map((row) => this.toDto(row));
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    data: {
      name?: string | null;
      groupIds?: string[];
      status?: AdminUserStatus;
    },
  ) {
    const existing = await this.prisma.adminUser.findFirst({
      where: { id, tenantId },
      select: { id: true, role: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Utilizador não encontrado');
    }

    const groupIds =
      data.groupIds === undefined
        ? undefined
        : await this.groups.assertGroupsBelongToTenant(tenantId, data.groupIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id },
        data: {
          name: data.name === undefined ? undefined : data.name,
          status: data.status === undefined ? undefined : data.status,
        },
      });
      if (groupIds !== undefined) {
        await this.replaceGroups(tx, id, groupIds);
      }
    });

    return this.getForTenant(tenantId, id);
  }

  async approve(tenantId: string, id: string) {
    const existing = await this.prisma.adminUser.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Utilizador não encontrado');
    }
    if (existing.status !== AdminUserStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Este utilizador não está pendente de aprovação.');
    }
    await this.prisma.adminUser.update({
      where: { id },
      data: { status: AdminUserStatus.ACTIVE, approvedAt: new Date() },
    });
    return this.getForTenant(tenantId, id);
  }

  /**
   * Remove um utilizador do tenant (qualquer estado: ativo, suspenso, pendente
   * ou convidado). Limpa convites associados; os pedidos de recuperação de
   * senha caem por cascata. Não permite remover a própria conta.
   */
  async remove(tenantId: string, id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Não pode remover a sua própria conta.');
    }
    const existing = await this.prisma.adminUser.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Utilizador não encontrado');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUserInvitation.deleteMany({
        where: { tenantId, userId: id },
      });
      await tx.adminUser.delete({ where: { id } });
    });
    return { ok: true };
  }

  private async getForTenant(tenantId: string, id: string) {
    const row = await this.prisma.adminUser.findFirst({
      where: { id, tenantId },
      select: userSelect,
    });
    if (!row) {
      throw new NotFoundException('Utilizador não encontrado');
    }
    return this.toDto(row);
  }

  private async replaceGroups(
    tx: Prisma.TransactionClient,
    userId: string,
    groupIds: string[],
  ) {
    await tx.adminUserPermissionGroup.deleteMany({ where: { userId } });
    if (groupIds.length > 0) {
      await tx.adminUserPermissionGroup.createMany({
        data: groupIds.map((groupId) => ({ userId, groupId })),
        skipDuplicates: true,
      });
    }
  }

  private toDto(row: UserRow) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      approvedAt: row.approvedAt,
      createdAt: row.createdAt,
      groups: row.permissionGroups.map((pg) => ({
        id: pg.group.id,
        name: pg.group.name,
      })),
    };
  }
}
