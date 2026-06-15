import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import EventDetailRoutePage from "@/features/events/pages/EventDetailRoutePage";
import EventFormPage from "@/features/events/pages/EventFormPage";
import EventsListPage from "@/features/events/pages/EventsListPage";
import RegistrationsPage from "@/features/events/pages/RegistrationsPage";
import Financial from "@/pages/Financial";
import Index from "@/pages/Index";
import { ModuleComingSoon } from "@/pages/ModuleComingSoon";
import NotFound from "@/pages/NotFound";
import Settings from "@/pages/Settings";
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
        <Route path="/eventos" element={<EventsListPage />} />
        <Route path="/eventos/novo" element={<EventFormPage />} />
        <Route path="/eventos/inscricoes" element={<RegistrationsPage />} />
        <Route path="/eventos/:id" element={<EventDetailRoutePage />} />
        <Route path="/eventos/:id/editar" element={<EventFormPage />} />
        <Route
          path="/site"
          element={
            <ModuleComingSoon
              title="Gestão do site"
              description="Conteúdo público, banners e CMS por igreja serão adicionados aqui numa próxima versão."
            />
          }
        />
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
