import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getStoredToken } from "@/lib/auth-storage";

export function ProtectedRoute() {
  const location = useLocation();
  const token = getStoredToken();

  if (!token) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next || "/")}`} replace />;
  }

  return <Outlet />;
}
