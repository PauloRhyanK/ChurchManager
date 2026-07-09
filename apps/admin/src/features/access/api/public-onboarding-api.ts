import { api } from "@/lib/api";

export interface SignupInfo {
  churchName: string;
  tenantSlug: string;
}

export interface InvitationInfo {
  email: string;
  churchName: string;
  tenantSlug: string;
}

export async function fetchSignupInfo(token: string) {
  const { data } = await api.get<SignupInfo>(`/public/signup/${token}`);
  return data;
}

export async function submitSignup(
  token: string,
  input: { name: string; email: string; password: string },
) {
  const { data } = await api.post<{ ok: boolean }>(
    `/public/signup/${token}`,
    input,
  );
  return data;
}

export async function fetchInvitationInfo(token: string) {
  const { data } = await api.get<InvitationInfo>(
    `/public/invitations/${token}`,
  );
  return data;
}

export async function acceptInvitation(
  token: string,
  input: { name?: string | null; password: string },
) {
  const { data } = await api.post<{ ok: boolean }>(
    `/public/invitations/${token}/accept`,
    input,
  );
  return data;
}
