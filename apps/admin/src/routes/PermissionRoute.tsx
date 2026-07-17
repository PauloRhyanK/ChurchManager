import { Navigate, Outlet } from "react-router-dom";
import type { PermissionLevel, PermissionModule } from "@/lib/auth-storage";
import { usePermissions } from "@/features/access/hooks/use-permissions";

interface PermissionRouteProps {
  module: PermissionModule;
  level?: PermissionLevel;
}

/** Protege rotas por módulo/nível de permissão; redireciona para "/" se não tiver. */
export function PermissionRoute({ module, level = "VIEW" }: PermissionRouteProps) {
  const { can } = usePermissions();
  if (!can(module, level)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
