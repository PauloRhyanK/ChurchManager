import { api } from "@/lib/api";
import type { PermissionEntry } from "../permissions";

export interface PermissionGroupDto {
  id: string;
  name: string;
  description: string | null;
  entries: PermissionEntry[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionGroupInput {
  name: string;
  description?: string | null;
  entries: PermissionEntry[];
}

export async function fetchPermissionGroups() {
  const { data } = await api.get<{ items: PermissionGroupDto[] }>(
    "/admin/tenants/me/permission-groups",
  );
  return data.items;
}

export async function fetchPermissionGroup(id: string) {
  const { data } = await api.get<PermissionGroupDto>(
    `/admin/tenants/me/permission-groups/${id}`,
  );
  return data;
}

export async function createPermissionGroup(input: PermissionGroupInput) {
  const { data } = await api.post<PermissionGroupDto>(
    "/admin/tenants/me/permission-groups",
    input,
  );
  return data;
}

export async function updatePermissionGroup(
  id: string,
  input: PermissionGroupInput,
) {
  const { data } = await api.patch<PermissionGroupDto>(
    `/admin/tenants/me/permission-groups/${id}`,
    input,
  );
  return data;
}

export async function deletePermissionGroup(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/permission-groups/${id}`,
  );
  return data;
}
