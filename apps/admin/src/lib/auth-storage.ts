const TOKEN_KEY = "cm_admin_token";
const SESSION_KEY = "cm_admin_session";

export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
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
    return JSON.parse(raw) as AuthSession;
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
