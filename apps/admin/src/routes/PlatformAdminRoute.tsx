import { Navigate, Outlet } from "react-router-dom";
import { getStoredSession } from "@/lib/auth-storage";

export function PlatformAdminRoute() {
  const session = getStoredSession();
  if (session?.user?.role !== "PLATFORM_ADMIN") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
