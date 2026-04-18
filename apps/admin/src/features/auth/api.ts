import { api } from "@/lib/api";

import type { AdminUserRole } from "@/lib/auth-storage";

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    tenantSlug: string;
    /** Presente a partir da API com multitenancy por papéis. */
    role?: AdminUserRole;
  };
}

export async function loginRequest(email: string, password: string) {
  const { data } = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}
