import { Injectable } from '@nestjs/common';
import { AdminUserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  allEditPermissions,
  isSuperRole,
  mergePermissionEntries,
  type PermissionMap,
} from './permissions';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve o mapa de permissões efectivas de um utilizador.
   * Super utilizadores (TENANT_ADMIN/PLATFORM_ADMIN) recebem tudo em EDIT;
   * os restantes recebem a união dos grupos a que pertencem.
   */
  async resolveForUser(
    userId: string,
    role: AdminUserRole,
  ): Promise<PermissionMap> {
    if (isSuperRole(role)) {
      return allEditPermissions();
    }
    const memberships = await this.prisma.adminUserPermissionGroup.findMany({
      where: { userId },
      select: { group: { select: { entries: true } } },
    });
    const entries = memberships.flatMap((m) => m.group.entries);
    return mergePermissionEntries(entries);
  }
}
