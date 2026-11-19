import { api } from "@/lib/api";
import type { SermonDoc } from "../lib/document";
import type { SlideItem, SlideMode, SlideStyle } from "../lib/slides";

export type { SlideItem, SlideKind, SlideMode, SlideStyle } from "../lib/slides";

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
  /** Slides marcados e não privados: o que vai para o envio. */
  slideCount: number;
  updatedAt: string;
}

export interface Sermon extends SermonSummary {
  document: SermonDoc;
  revision: number;
  slideMode: SlideMode | null;
  slideStyle: SlideStyle;
  slides: SlideItem[];
  /** O documento (ou o título, se o slide de título não foi editado) mudou depois da última geração dos slides. */
  slidesStale: boolean;
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

export interface SermonAi {
  enabled: boolean;
  models: { id: string; label: string }[];
}

export async function getSermonAi(): Promise<SermonAi> {
  return (await api.get<SermonAi>(`${SERMONS}/ai`)).data;
}

export async function generateSlides(id: string, input: { mode: SlideMode; style?: SlideStyle; model?: string }): Promise<Sermon> {
  const body: { mode: SlideMode; style?: SlideStyle; model?: string } = { mode: input.mode };
  if (input.style !== undefined) body.style = input.style;
  if (input.model !== undefined) body.model = input.model;
  return (await api.post<Sermon>(`${SERMONS}/${id}/slides/generate`, body)).data;
}

export interface SlideItemInput {
  id: string;
  included: boolean;
  text?: string;
  /** Subtítulo do ponto (modelo 02) ou do versículo (modelo 04); "" tira. */
  subtitle?: string;
}

export async function saveSlides(id: string, input: { style?: SlideStyle; items: SlideItemInput[] }): Promise<Sermon> {
  const body: { style?: SlideStyle; items: SlideItemInput[] } = {
    items: input.items.map((i) => {
      const item: SlideItemInput = { id: i.id, included: i.included };
      if (i.text !== undefined) item.text = i.text;
      if (i.subtitle !== undefined) item.subtitle = i.subtitle;
      return item;
    }),
  };
  if (input.style !== undefined) body.style = input.style;
  return (await api.put<Sermon>(`${SERMONS}/${id}/slides`, body)).data;
}

// ---- Bíblia (tabelas globais; espelha apps/api/src/modules/sermons/bible) ----

export interface BibleTranslation {
  code: string;
  name: string;
  shortName: string;
  attribution: string;
  license: string;
  isDefault: boolean;
}

/** Um resultado da busca: já no formato do bloco Versículo, mais a dica para a lista. */
export interface BibleHit {
  reference: string;
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  translation: string;
  verses: { number: number; text: string }[];
  hint: string | null;
}

export interface BibleSearchResult {
  mode: "REFERENCE" | "TEXT" | "NONE";
  hits: BibleHit[];
}

const BIBLE = `${SERMONS}/bible`;

export async function listBibleTranslations(): Promise<BibleTranslation[]> {
  return (await api.get<BibleTranslation[]>(`${BIBLE}/translations`)).data;
}

export async function searchBible(q: string, translation?: string): Promise<BibleSearchResult> {
  const params: { q: string; translation?: string } = { q };
  if (translation) params.translation = translation;
  return (await api.get<BibleSearchResult>(`${BIBLE}/search`, { params })).data;
}
