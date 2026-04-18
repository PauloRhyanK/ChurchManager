import { api } from "@/lib/api";

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export async function fetchPlatformTenants(): Promise<TenantListItem[]> {
  const { data } = await api.get<{ items: TenantListItem[] }>("/admin/platform/tenants");
  return data.items;
}

export interface CreatePlatformTenantBody {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

export async function createPlatformTenant(body: CreatePlatformTenantBody) {
  const { data } = await api.post<{
    tenant: { id: string; name: string; slug: string };
    admin: { id: string; email: string };
  }>("/admin/platform/tenants", body);
  return data;
}
