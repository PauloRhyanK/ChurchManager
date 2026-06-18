import { api } from "@/lib/api";

export interface EventTagDto {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
  createdAt: string;
}

export async function fetchEventTags() {
  const { data } = await api.get<{ items: EventTagDto[] }>(
    "/admin/tenants/me/event-tags",
  );
  return data.items;
}

export async function createEventTag(name: string) {
  const { data } = await api.post<{ id: string; name: string; slug: string }>(
    "/admin/tenants/me/event-tags",
    { name },
  );
  return data;
}

export async function deleteEventTag(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/event-tags/${id}`,
  );
  return data;
}
