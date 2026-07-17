import { api } from "@/lib/api";

export interface CheckinEventDto {
  id: string;
  title: string;
  date: string;
  timeStart: string | null;
  location: string | null;
  tag: string | null;
  ticketsIssued: number;
  checkedIn: number;
}

export interface CheckinTicketDto {
  id: string;
  publicCode: string;
  holderName: string;
  status: string;
  checkedInAt: string | null;
  checkedInByName: string | null;
  orderId: string;
  ticketTypeName: string;
}

export interface CheckinLoteDto {
  orderId: string;
  buyerName: string | null;
  tickets: CheckinTicketDto[];
}

export interface CheckinLookupDto {
  ticket: CheckinTicketDto;
  event: { id: string; title: string; date: string; timeStart: string | null };
  lote: CheckinLoteDto;
}

export async function fetchCheckinEvents(scope: "today" | "all" = "today") {
  const { data } = await api.get<{ items: CheckinEventDto[] }>(
    "/admin/tenants/me/checkin/events",
    { params: { scope } },
  );
  return data.items;
}

export async function fetchEventLotes(eventId: string, search?: string) {
  const { data } = await api.get<{ items: CheckinLoteDto[] }>(
    `/admin/tenants/me/checkin/events/${eventId}/tickets`,
    { params: search ? { search } : {} },
  );
  return data.items;
}

export async function lookupTicket(code: string) {
  const { data } = await api.get<CheckinLookupDto>(
    "/admin/tenants/me/checkin/tickets/lookup",
    { params: { code } },
  );
  return data;
}

export async function checkInTicket(ticketId: string) {
  const { data } = await api.post<CheckinTicketDto>(
    `/admin/tenants/me/checkin/tickets/${encodeURIComponent(ticketId)}/checkin`,
  );
  return data;
}

export async function undoCheckIn(ticketId: string) {
  const { data } = await api.post<CheckinTicketDto>(
    `/admin/tenants/me/checkin/tickets/${encodeURIComponent(ticketId)}/undo`,
  );
  return data;
}
