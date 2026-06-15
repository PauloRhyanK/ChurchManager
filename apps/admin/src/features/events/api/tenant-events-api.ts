import { api } from "@/lib/api";

export interface EventDto {
  id: string;
  title: string;
  description: string | null;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  imageUrl: string | null;
  tag: string | null;
  published: boolean;
  slug: string | null;
  timezone: string | null;
  registrationClosesAt: string | null;
  termsUrl: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventsDashboardSummaryDto {
  totalEvents: number;
  publishedEvents: number;
  upcomingEvents: number;
  totalRegistrations: number;
  confirmedOrders: number;
  totalRevenueCents: number;
  upcomingEventsList: Array<{
    id: string;
    title: string;
    date: string;
    published: boolean;
  }>;
}

export interface EventReportDto {
  event: {
    id: string;
    title: string;
    date: string;
    published: boolean;
  };
  registrationCount: number;
  ticketsIssued: number;
  ticketsSold: number;
  confirmedRevenueCents: number;
  ordersSummary: Array<{
    status: string;
    count: number;
    totalCents: number;
  }>;
  ticketTypes: Array<{
    id: string;
    name: string;
    priceCents: number;
    quantityTotal: number | null;
    quantitySold: number;
    quantityRemaining: number | null;
    active: boolean;
  }>;
}

export type CreateEventBody = {
  title: string;
  description?: string | null;
  date: string;
  timeStart?: string;
  timeEnd?: string;
  location?: string | null;
  imageUrl?: string | null;
  tag?: string | null;
  published?: boolean;
};

export type UpdateEventBody = Partial<CreateEventBody>;

export async function fetchEvents() {
  const { data } = await api.get<{ items: EventDto[] }>("/admin/tenants/me/events");
  return data.items;
}

export async function fetchEvent(id: string) {
  const { data } = await api.get<EventDto>(`/admin/tenants/me/events/${id}`);
  return data;
}

export async function createEvent(body: CreateEventBody) {
  const { data } = await api.post<EventDto>("/admin/tenants/me/events", body);
  return data;
}

export async function updateEvent(id: string, body: UpdateEventBody) {
  const { data } = await api.put<EventDto>(`/admin/tenants/me/events/${id}`, body);
  return data;
}

export async function deleteEvent(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/admin/tenants/me/events/${id}`);
  return data;
}

export async function fetchEventsDashboardSummary() {
  const { data } = await api.get<EventsDashboardSummaryDto>(
    "/admin/tenants/me/events-dashboard",
  );
  return data;
}

export async function fetchEventReport(eventId: string) {
  const { data } = await api.get<EventReportDto>(
    `/admin/tenants/me/events-dashboard/${eventId}/report`,
  );
  return data;
}
