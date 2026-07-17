import { AdminUserRole, PermissionLevel, PermissionModule } from '@prisma/client';

/** Todos os módulos passíveis de permissão, em ordem estável para UI/serialização. */
export const PERMISSION_MODULES: PermissionModule[] = [
  PermissionModule.DASHBOARD,
  PermissionModule.EVENTS,
  PermissionModule.EVENT_REGISTRATIONS,
  PermissionModule.EVENT_TICKETS,
  PermissionModule.CHECKIN,
  PermissionModule.FINANCIAL,
  PermissionModule.SITE,
  PermissionModule.SETTINGS,
  PermissionModule.USERS,
];

/** Mapa de permissões efectivas de um utilizador (módulo → nível concedido). */
export type PermissionMap = Partial<Record<PermissionModule, PermissionLevel>>;

/** Papéis com acesso total ao tenant, ignorando grupos de permissões. */
export function isSuperRole(role: AdminUserRole): boolean {
  return (
    role === AdminUserRole.TENANT_ADMIN ||
    role === AdminUserRole.PLATFORM_ADMIN
  );
}

/** EDIT satisfaz VIEW; VIEW só satisfaz VIEW. */
export function levelSatisfies(
  granted: PermissionLevel | undefined,
  required: PermissionLevel,
): boolean {
  if (!granted) return false;
  if (granted === PermissionLevel.EDIT) return true;
  return required === PermissionLevel.VIEW;
}

/** Mapa com todos os módulos em EDIT (super utilizadores). */
export function allEditPermissions(): PermissionMap {
  const map: PermissionMap = {};
  for (const module of PERMISSION_MODULES) {
    map[module] = PermissionLevel.EDIT;
  }
  return map;
}

/**
 * Combina entradas de vários grupos num único mapa, mantendo o nível mais alto
 * por módulo (EDIT sobrepõe-se a VIEW).
 */
export function mergePermissionEntries(
  entries: { module: PermissionModule; level: PermissionLevel }[],
): PermissionMap {
  const map: PermissionMap = {};
  for (const entry of entries) {
    const current = map[entry.module];
    if (current === PermissionLevel.EDIT) continue;
    map[entry.module] = entry.level;
  }
  return map;
}
