const KEY = 'cm_admin_token';

export function getStoredToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(KEY, token);
}

export function clearStoredToken() {
  sessionStorage.removeItem(KEY);
}
