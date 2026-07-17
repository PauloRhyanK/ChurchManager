import type { AdminUserRole, AdminUserStatus } from '@prisma/client';
import type { PermissionMap } from '../access/permissions';

/** Utilizador injectado no request após JwtStrategy.validate */
export interface AuthUser {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  /** Permissões efectivas por módulo. Super utilizadores têm tudo em EDIT. */
  permissions: PermissionMap;
}
