import { Navigate, Outlet } from "react-router-dom";
import type { PermissionLevel, PermissionModule } from "@/lib/auth-storage";
import { usePermissions } from "@/features/access/hooks/use-permissions";

interface PermissionRouteProps {
  /** Com uma lista, basta ter permissão em qualquer um dos módulos. */
  module: PermissionModule | PermissionModule[];
  level?: PermissionLevel;
}

/** Protege rotas por módulo/nível de permissão; redireciona para "/" se não tiver. */
export function PermissionRoute({ module, level = "VIEW" }: PermissionRouteProps) {
  const { can } = usePermissions();
  const modules = Array.isArray(module) ? module : [module];
  if (!modules.some((m) => can(m, level))) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
