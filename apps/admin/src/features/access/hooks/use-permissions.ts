import { getStoredSession } from "@/lib/auth-storage";
import type { PermissionLevel, PermissionModule } from "@/lib/auth-storage";

function levelSatisfies(
  granted: PermissionLevel | undefined,
  required: PermissionLevel,
): boolean {
  if (!granted) return false;
  if (granted === "EDIT") return true;
  return required === "VIEW";
}

/**
 * Permissões da sessão atual. Super utilizadores (TENANT_ADMIN/PLATFORM_ADMIN)
 * têm acesso total, independentemente do mapa de permissões.
 */
export function usePermissions() {
  const session = getStoredSession();
  const role = session?.user.role ?? "TENANT_ADMIN";
  const isSuperAdmin = role === "TENANT_ADMIN" || role === "PLATFORM_ADMIN";
  const permissions = session?.user.permissions ?? {};

  const can = (module: PermissionModule, level: PermissionLevel): boolean => {
    if (isSuperAdmin) return true;
    return levelSatisfies(permissions[module], level);
  };

  return { can, isSuperAdmin, role, permissions };
}
