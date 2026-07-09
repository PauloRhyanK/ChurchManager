const TOKEN_KEY = "cm_admin_token";
const SESSION_KEY = "cm_admin_session";

export type AdminUserRole = "TENANT_ADMIN" | "PLATFORM_ADMIN" | "TENANT_MEMBER";

export type AdminUserStatus =
  | "ACTIVE"
  | "PENDING_APPROVAL"
  | "INVITED"
  | "SUSPENDED";

export type PermissionModule =
  | "DASHBOARD"
  | "EVENTS"
  | "EVENT_REGISTRATIONS"
  | "EVENT_TICKETS"
  | "FINANCIAL"
  | "SITE"
  | "SETTINGS"
  | "USERS";

export type PermissionLevel = "VIEW" | "EDIT";

export type PermissionMap = Partial<Record<PermissionModule, PermissionLevel>>;

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  tenantId: string;
  tenantSlug: string;
  /** Ausente em sessões antigas; tratado como `TENANT_ADMIN` ao ler. */
  role?: AdminUserRole;
  status?: AdminUserStatus;
  /** Permissões efectivas por módulo; ausente em sessões antigas. */
  permissions?: PermissionMap;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getStoredSession(): AuthSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (parsed.user && parsed.user.role == null) {
      parsed.user = { ...parsed.user, role: "TENANT_ADMIN" };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  setStoredToken(session.accessToken);
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function clearStoredSession() {
  clearStoredToken();
  sessionStorage.removeItem(SESSION_KEY);
}
