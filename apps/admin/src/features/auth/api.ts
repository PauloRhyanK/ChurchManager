import { api } from "@/lib/api";

import type {
  AdminUserRole,
  AdminUserStatus,
  PermissionMap,
} from "@/lib/auth-storage";

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    tenantId: string;
    tenantSlug: string;
    /** Presente a partir da API com multitenancy por papéis. */
    role?: AdminUserRole;
    status?: AdminUserStatus;
    permissions?: PermissionMap;
  };
}

export async function loginRequest(email: string, password: string) {
  const { data } = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}
