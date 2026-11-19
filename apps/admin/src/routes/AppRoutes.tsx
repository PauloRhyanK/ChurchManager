import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/features/auth/pages/ResetPasswordPage";
import AccountPage from "@/features/auth/pages/AccountPage";
import EventDetailRoutePage from "@/features/events/pages/EventDetailRoutePage";
import EventFormPage from "@/features/events/pages/EventFormPage";
import EventsListPage from "@/features/events/pages/EventsListPage";
import EventSettingsPage from "@/features/events/pages/EventSettingsPage";
import RegistrationsPage from "@/features/events/pages/RegistrationsPage";
import CheckinPage from "@/features/checkin/pages/CheckinPage";
import ChurchPage from "@/features/church/pages/ChurchPage";
import SongsListPage from "@/features/worship/pages/SongsListPage";
import NewSongPage from "@/features/worship/pages/NewSongPage";
import SongEditorPage from "@/features/worship/pages/SongEditorPage";
import ServicePlanPage from "@/features/worship/pages/ServicePlanPage";
import ServiceTemplatesPage from "@/features/worship/pages/ServiceTemplatesPage";
import SermonsListPage from "@/features/sermons/pages/SermonsListPage";
import SermonSlidesPage from "@/features/sermons/pages/SermonSlidesPage";
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

const SermonEditorPage = lazy(() => import("@/features/sermons/pages/SermonEditorPage"));

/** Remonta o editor quando a palavra muda (o documento é estado local). */
function SermonEditorRoutePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <SermonEditorPage key={id} />
    </Suspense>
  );
}

/** Remonta o editor quando a música muda (o documento da letra é estado local). */
function SongEditorRoutePage() {
  const { id } = useParams<{ id: string }>();
  return <SongEditorPage key={id} />;
}

/** Remonta o formulário quando o id muda (ex.: de /eventos/novo para /eventos/:id/editar). */
function EventFormRoutePage() {
  const { id } = useParams<{ id: string }>();
  return <EventFormPage key={id ?? "new"} />;
}

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
        <Route element={<PermissionRoute module="EVENTS" />}>
          <Route path="/eventos" element={<EventsListPage />} />
          <Route path="/eventos/configuracoes" element={<EventSettingsPage />} />
          {/* A API das inscrições exige o módulo EVENT_REGISTRATIONS. */}
          <Route element={<PermissionRoute module="EVENT_REGISTRATIONS" />}>
            <Route path="/eventos/inscricoes" element={<RegistrationsPage />} />
          </Route>
          <Route path="/eventos/:id" element={<EventDetailRoutePage />} />
          <Route element={<PermissionRoute module="EVENTS" level="EDIT" />}>
            <Route path="/eventos/novo" element={<EventFormRoutePage />} />
            <Route path="/eventos/:id/editar" element={<EventFormRoutePage />} />
          </Route>
        </Route>
        <Route element={<PermissionRoute module="WORSHIP" />}>
          <Route path="/cultos" element={<Navigate to="/cultos/roteiro" replace />} />
          <Route path="/cultos/musicas" element={<SongsListPage />} />
          <Route element={<PermissionRoute module="WORSHIP" level="EDIT" />}>
            <Route path="/cultos/musicas/nova" element={<NewSongPage />} />
          </Route>
          <Route path="/cultos/musicas/:id" element={<SongEditorRoutePage />} />
          <Route path="/cultos/roteiro" element={<ServicePlanPage />} />
          <Route path="/cultos/roteiro/modelos" element={<ServiceTemplatesPage />} />
        </Route>
        <Route element={<PermissionRoute module="SERMONS" />}>
          <Route path="/palavras" element={<SermonsListPage />} />
          <Route path="/palavras/:id" element={<SermonEditorRoutePage />} />
          {/* Conferência dos slides: com o menu, como a lista (o editor fica sem ele). */}
          <Route path="/palavras/:id/slides" element={<SermonSlidesPage />} />
        </Route>
        {/* O site é gerido na aba Site de Igreja; /site fica como atalho. */}
        <Route path="/site" element={<Navigate to="/igreja?aba=site" replace />} />
        <Route element={<PermissionRoute module={["CHURCH", "SITE"]} />}>
          <Route path="/igreja" element={<ChurchPage />} />
        </Route>
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="/minha-conta" element={<AccountPage />} />

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
