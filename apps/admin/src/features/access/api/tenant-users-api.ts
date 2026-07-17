import { api } from "@/lib/api";
import type { AdminUserRole, AdminUserStatus } from "@/lib/auth-storage";

export interface TenantUserDto {
  id: string;
  email: string;
  name: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  approvedAt: string | null;
  createdAt: string;
  groups: { id: string; name: string }[];
}

export interface InviteUserInput {
  email: string;
  name?: string | null;
  groupIds?: string[];
}

export interface InviteUserResult {
  id: string;
  email: string;
  token: string;
  url: string;
  expiresAt: string;
}

export interface UpdateUserInput {
  name?: string | null;
  groupIds?: string[];
  status?: Extract<AdminUserStatus, "ACTIVE" | "SUSPENDED">;
}

export async function fetchTenantUsers() {
  const { data } = await api.get<{ items: TenantUserDto[] }>(
    "/admin/tenants/me/users",
  );
  return data.items;
}

export async function fetchPendingUsers() {
  const { data } = await api.get<{ items: TenantUserDto[] }>(
    "/admin/tenants/me/users/pending",
  );
  return data.items;
}

export async function inviteUser(input: InviteUserInput) {
  const { data } = await api.post<InviteUserResult>(
    "/admin/tenants/me/users/invite",
    input,
  );
  return data;
}

export async function updateTenantUser(id: string, input: UpdateUserInput) {
  const { data } = await api.patch<TenantUserDto>(
    `/admin/tenants/me/users/${id}`,
    input,
  );
  return data;
}

export async function approveUser(id: string) {
  const { data } = await api.post<TenantUserDto>(
    `/admin/tenants/me/users/${id}/approve`,
  );
  return data;
}

export async function rejectUser(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/users/${id}`,
  );
  return data;
}

export async function deleteTenantUser(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/users/${id}`,
  );
  return data;
}
