import { api } from "@/lib/api";

export interface SignupLinkDto {
  id: string;
  token: string;
  url: string;
  label: string | null;
  defaultGroupIds: string[];
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSignupLinkInput {
  label?: string | null;
  defaultGroupIds?: string[];
  expiresInDays?: number;
  maxUses?: number;
}

export interface UpdateSignupLinkInput {
  label?: string | null;
  defaultGroupIds?: string[];
  isActive?: boolean;
}

export async function fetchSignupLinks() {
  const { data } = await api.get<{ items: SignupLinkDto[] }>(
    "/admin/tenants/me/signup-links",
  );
  return data.items;
}

export async function createSignupLink(input: CreateSignupLinkInput) {
  const { data } = await api.post<SignupLinkDto>(
    "/admin/tenants/me/signup-links",
    input,
  );
  return data;
}

export async function updateSignupLink(
  id: string,
  input: UpdateSignupLinkInput,
) {
  const { data } = await api.patch<SignupLinkDto>(
    `/admin/tenants/me/signup-links/${id}`,
    input,
  );
  return data;
}

export async function deleteSignupLink(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/signup-links/${id}`,
  );
  return data;
}
