import { api } from "@/lib/api";

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(input: ChangePasswordInput) {
  const { data } = await api.post<{ ok: boolean }>(
    "/auth/change-password",
    input,
  );
  return data;
}
