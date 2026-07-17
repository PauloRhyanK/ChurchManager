import { api } from "@/lib/api";

export interface PasswordResetInfo {
  email: string;
}

export async function requestPasswordReset(email: string) {
  const { data } = await api.post<{ ok: boolean }>("/public/password-reset", {
    email,
  });
  return data;
}

export async function fetchPasswordResetInfo(token: string) {
  const { data } = await api.get<PasswordResetInfo>(
    `/public/password-reset/${token}`,
  );
  return data;
}

export async function resetPassword(token: string, password: string) {
  const { data } = await api.post<{ ok: boolean }>(
    `/public/password-reset/${token}`,
    { password },
  );
  return data;
}
