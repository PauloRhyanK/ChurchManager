import { api } from "@/lib/api";
import type { SermonDoc } from "../lib/document";

export type SermonStatus = "DRAFT" | "SENT" | "PREACHED";

export interface SermonDelivery {
  /** AAAA-MM-DD */
  date: string;
  /** HH:MM */
  startTime: string;
  serviceId: string | null;
  serviceName: string | null;
}

export interface SermonSummary {
  id: string;
  title: string;
  baseReference: string | null;
  pointCount: number;
  estimatedSeconds: number;
  status: SermonStatus;
  delivery: SermonDelivery | null;
  updatedAt: string;
}

export interface Sermon extends SermonSummary {
  document: SermonDoc;
  revision: number;
}

export interface SermonsList {
  items: SermonSummary[];
  counts: { all: number; draft: number; sent: number; preached: number };
}

export interface ServiceOption {
  id: string;
  date: string;
  startTime: string;
  name: string;
  hasSermon: boolean;
  isMine: boolean;
}

export interface DeliveryPreview {
  service: { id: string; date: string; startTime: string; name: string } | null;
  occupied: boolean;
}

/** Um culto (serviceId) OU data e hora (date + startTime). */
export type SendTarget = { serviceId: string } | { date: string; startTime: string };

const SERMONS = "/admin/tenants/me/sermons";

export async function listSermons(filters: { q?: string; status?: SermonStatus } = {}): Promise<SermonsList> {
  const params: { q?: string; status?: SermonStatus } = {};
  if (filters.q) params.q = filters.q;
  if (filters.status) params.status = filters.status;
  return (await api.get<SermonsList>(SERMONS, { params })).data;
}

export async function createSermon(input: { title?: string } = {}): Promise<Sermon> {
  const body: { title?: string } = {};
  if (input.title !== undefined) body.title = input.title;
  return (await api.post<Sermon>(SERMONS, body)).data;
}

export async function getSermon(id: string): Promise<Sermon> {
  return (await api.get<Sermon>(`${SERMONS}/${id}`)).data;
}

export async function updateSermon(
  id: string,
  input: { title?: string; document?: SermonDoc; baseRevision?: number },
): Promise<Sermon> {
  const body: { title?: string; document?: SermonDoc; baseRevision?: number } = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.document !== undefined) body.document = input.document;
  if (input.baseRevision !== undefined) body.baseRevision = input.baseRevision;
  return (await api.put<Sermon>(`${SERMONS}/${id}`, body)).data;
}

export async function duplicateSermon(id: string): Promise<Sermon> {
  return (await api.post<Sermon>(`${SERMONS}/${id}/duplicate`)).data;
}

export async function deleteSermon(id: string): Promise<void> {
  await api.delete(`${SERMONS}/${id}`);
}

export async function listServiceOptions(): Promise<ServiceOption[]> {
  return (await api.get<ServiceOption[]>(`${SERMONS}/service-options`)).data;
}

export async function previewDelivery(date: string, startTime: string): Promise<DeliveryPreview> {
  return (await api.get<DeliveryPreview>(`${SERMONS}/delivery-preview`, { params: { date, startTime } })).data;
}

export async function sendSermon(id: string, target: SendTarget, replace?: boolean): Promise<Sermon> {
  const body: { serviceId?: string; date?: string; startTime?: string; replace?: boolean } = {};
  if ("serviceId" in target) {
    body.serviceId = target.serviceId;
  } else {
    body.date = target.date;
    body.startTime = target.startTime;
  }
  if (replace !== undefined) body.replace = replace;
  return (await api.put<Sermon>(`${SERMONS}/${id}/delivery`, body)).data;
}

export async function cancelDelivery(id: string): Promise<Sermon> {
  return (await api.delete<Sermon>(`${SERMONS}/${id}/delivery`)).data;
}
