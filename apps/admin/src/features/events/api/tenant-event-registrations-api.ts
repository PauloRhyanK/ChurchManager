import { api } from "@/lib/api";

export interface EventRegistrationDto {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  userId: string | null;
  createdAt: string;
  event?: {
    title: string;
    date: string;
    tag: string | null;
  };
}

export async function fetchAllRegistrations() {
  const { data } = await api.get<{ items: EventRegistrationDto[] }>(
    "/admin/tenants/me/registrations",
  );
  return data.items;
}

export async function fetchEventRegistrations(eventId: string) {
  const { data } = await api.get<{ items: EventRegistrationDto[] }>(
    `/admin/tenants/me/events/${eventId}/registrations`,
  );
  return data.items;
}
