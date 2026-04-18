import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import Events from "@/pages/Events";
import Financial from "@/pages/Financial";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import Settings from "@/pages/Settings";
import SiteManagement from "@/pages/SiteManagement";
import PlatformChurches from "@/pages/PlatformChurches";
import { PlatformAdminRoute } from "./PlatformAdminRoute";
import { ProtectedRoute } from "./ProtectedRoute";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Index />} />
        <Route path="/financeiro" element={<Financial />} />
        <Route path="/eventos" element={<Events />} />
        <Route path="/site" element={<SiteManagement />} />
        <Route path="/configuracoes" element={<Settings />} />

        <Route element={<PlatformAdminRoute />}>
          <Route path="/plataforma/igrejas" element={<PlatformChurches />} />
        </Route>

        <Route path="/admin" element={<Navigate to="/financeiro" replace />} />
        <Route path="/admin/financeiro/cotas" element={<Navigate to="/financeiro" replace />} />
        <Route path="/admin/configuracoes/financeiro" element={<Navigate to="/configuracoes" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
