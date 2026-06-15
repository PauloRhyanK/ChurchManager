import { api } from "@/lib/api";

export interface EventTicketTypeDto {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceCents: number;
  feeCents: number;
  quantityTotal: number | null;
  quantitySold: number;
  quantityRemaining: number | null;
  minPerOrder: number;
  maxPerOrder: number;
  salesOpensAt: string | null;
  salesClosesAt: string | null;
  isSoldOut: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateTicketTypeBody = {
  name: string;
  description?: string | null;
  priceCents: number;
  feeCents?: number;
  quantityTotal?: number | null;
  minPerOrder?: number;
  maxPerOrder?: number;
  salesOpensAt?: string;
  salesClosesAt?: string;
  active?: boolean;
};

export type UpdateTicketTypeBody = Partial<CreateTicketTypeBody>;

export interface EventPaymentLinkDto {
  id: string;
  url: string;
  metadata: {
    source?: string;
    tenant?: string;
    reused?: boolean;
  };
}

export async function fetchEventTicketTypes(eventId: string) {
  const { data } = await api.get<{ items: EventTicketTypeDto[] }>(
    `/admin/tenants/me/events/${eventId}/ticket-types`,
  );
  return data.items;
}

export async function createEventTicketType(eventId: string, body: CreateTicketTypeBody) {
  const { data } = await api.post<EventTicketTypeDto>(
    `/admin/tenants/me/events/${eventId}/ticket-types`,
    body,
  );
  return data;
}

export async function updateEventTicketType(
  eventId: string,
  ticketTypeId: string,
  body: UpdateTicketTypeBody,
) {
  const { data } = await api.put<EventTicketTypeDto>(
    `/admin/tenants/me/events/${eventId}/ticket-types/${ticketTypeId}`,
    body,
  );
  return data;
}

export async function deleteEventTicketType(eventId: string, ticketTypeId: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/events/${eventId}/ticket-types/${ticketTypeId}`,
  );
  return data;
}

export async function createEventTicketPaymentLink(
  eventId: string,
  ticketTypeId: string,
  body: { name: string; presetKey?: string },
) {
  const { data } = await api.post<EventPaymentLinkDto>(
    `/admin/tenants/me/events/${eventId}/ticket-types/${ticketTypeId}/payment-link`,
    body,
  );
  return data;
}
