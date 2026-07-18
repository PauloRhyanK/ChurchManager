import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/features/auth/pages/ResetPasswordPage";
import EventDetailRoutePage from "@/features/events/pages/EventDetailRoutePage";
import EventFormPage from "@/features/events/pages/EventFormPage";
import EventsListPage from "@/features/events/pages/EventsListPage";
import EventSettingsPage from "@/features/events/pages/EventSettingsPage";
import RegistrationsPage from "@/features/events/pages/RegistrationsPage";
import CheckinPage from "@/features/checkin/pages/CheckinPage";
import SitePage from "@/features/site/pages/SitePage";
import UsersListPage from "@/features/access/pages/UsersListPage";
import InviteUserPage from "@/features/access/pages/InviteUserPage";
import PermissionGroupsPage from "@/features/access/pages/PermissionGroupsPage";
import PermissionGroupFormPage from "@/features/access/pages/PermissionGroupFormPage";
import SignupLinksPage from "@/features/access/pages/SignupLinksPage";
import PublicSignupPage from "@/features/access/pages/PublicSignupPage";
import AcceptInvitationPage from "@/features/access/pages/AcceptInvitationPage";
import Financial from "@/pages/Financial";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import Settings from "@/pages/Settings";
import PlatformChurches from "@/pages/PlatformChurches";
import { PlatformAdminRoute } from "./PlatformAdminRoute";
import { PermissionRoute } from "./PermissionRoute";
import { ProtectedRoute } from "./ProtectedRoute";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/recuperar-senha/:token" element={<ResetPasswordPage />} />
      <Route path="/cadastro/:token" element={<PublicSignupPage />} />
      <Route path="/convite/:token" element={<AcceptInvitationPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Index />} />
        <Route path="/financeiro" element={<Financial />} />
        <Route path="/eventos" element={<EventsListPage />} />
        <Route path="/eventos/novo" element={<EventFormPage />} />
        <Route path="/eventos/configuracoes" element={<EventSettingsPage />} />
        <Route path="/eventos/inscricoes" element={<RegistrationsPage />} />
        <Route path="/eventos/:id" element={<EventDetailRoutePage />} />
        <Route path="/eventos/:id/editar" element={<EventFormPage />} />
        <Route element={<PermissionRoute module="SITE" />}>
          <Route path="/site" element={<SitePage />} />
        </Route>
        <Route path="/configuracoes" element={<Settings />} />

        <Route element={<PermissionRoute module="CHECKIN" />}>
          <Route path="/checkin" element={<CheckinPage />} />
          <Route
            path="/checkin/inscricoes"
            element={<Navigate to="/checkin" replace />}
          />
        </Route>

        <Route path="/equipe/usuarios" element={<UsersListPage />} />
        <Route path="/equipe/usuarios/convidar" element={<InviteUserPage />} />
        <Route path="/equipe/grupos" element={<PermissionGroupsPage />} />
        <Route path="/equipe/grupos/novo" element={<PermissionGroupFormPage />} />
        <Route path="/equipe/grupos/:id" element={<PermissionGroupFormPage />} />
        <Route path="/equipe/links-cadastro" element={<SignupLinksPage />} />

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
