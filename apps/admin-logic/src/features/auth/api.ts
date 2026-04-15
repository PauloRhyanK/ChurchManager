import { api } from '@/lib/api';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    tenantSlug: string;
  };
}

export async function loginRequest(email: string, password: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', {
    email,
    password,
  });
  return data;
}
