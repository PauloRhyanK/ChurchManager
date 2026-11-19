import { api } from "@/lib/api";
import type { Pending, SongStatus, WorshipRow } from "../lib/document";

export interface SongAudio {
  url: string;
  fileName: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
}

export interface SongSummary {
  id: string;
  title: string;
  artist: string | null;
  musicalKey: string | null;
  bpm: number | null;
  timeSignature: string | null;
  status: SongStatus;
  pending: Pending[];
  slideCount: number;
  audio: SongAudio | null;
  readyAt: string | null;
  updatedAt: string;
}

export interface Song extends SongSummary {
  rawLyrics: string;
  rows: WorshipRow[];
  createdAt: string;
}

export interface SongsList {
  items: SongSummary[];
  counts: { all: number; ready: number; pending: number };
}

const SONGS = "/admin/tenants/me/worship/songs";
const SERVICES = "/admin/tenants/me/worship/services";
const TEMPLATES = "/admin/tenants/me/worship/service-templates";

export async function fetchSongs(): Promise<SongsList> {
  return (await api.get<SongsList>(SONGS)).data;
}

export async function fetchSong(id: string): Promise<Song> {
  return (await api.get<Song>(`${SONGS}/${id}`)).data;
}

export async function createSong(input: { title: string; rawLyrics?: string; organize?: boolean }): Promise<Song> {
  const body: { title: string; rawLyrics?: string; organize?: boolean } = { title: input.title };
  if (input.rawLyrics !== undefined) body.rawLyrics = input.rawLyrics;
  if (input.organize !== undefined) body.organize = input.organize;
  return (await api.post<Song>(SONGS, body)).data;
}

export interface SongInfoBody {
  title: string;
  artist: string | null;
  musicalKey: string | null;
  bpm: number | null;
  timeSignature: string | null;
}

export async function updateSongInfo(id: string, info: SongInfoBody): Promise<Song> {
  const body: SongInfoBody = {
    title: info.title,
    artist: info.artist,
    musicalKey: info.musicalKey,
    bpm: info.bpm,
    timeSignature: info.timeSignature,
  };
  return (await api.put<Song>(`${SONGS}/${id}`, body)).data;
}

/** Só os campos de cada linha que a API aceita, montados um a um. */
function rowBody(row: WorshipRow): WorshipRow {
  const body: WorshipRow = { id: row.id, type: row.type };
  if (row.type === "break") {
    // Linha esvaziada que abria parte ou slide: o servidor passa parte e tempo para a seguinte.
    if (row.part) body.part = { kind: row.part.kind, mood: row.part.mood };
    if (typeof row.time === "number") {
      body.time = row.time;
      body.timeSource = row.timeSource ?? "MANUAL";
    }
    return body;
  }
  body.text = (row.text ?? "").slice(0, 200);
  if (row.type === "cue") body.target = row.target ?? "ALL";
  if (row.part) body.part = { kind: row.part.kind, mood: row.part.mood };
  if (typeof row.time === "number") {
    body.time = row.time;
    body.timeSource = row.timeSource ?? "MANUAL";
  }
  return body;
}

export async function saveSongRows(id: string, rows: WorshipRow[]): Promise<Song> {
  return (await api.put<Song>(`${SONGS}/${id}`, { rows: rows.map(rowBody) })).data;
}

export async function organizeSong(id: string, rawLyrics?: string): Promise<Song> {
  const body: { rawLyrics?: string } = {};
  if (rawLyrics !== undefined) body.rawLyrics = rawLyrics;
  return (await api.post<Song>(`${SONGS}/${id}/organize`, body)).data;
}

export async function uploadSongAudio(id: string, file: File, durationSeconds: number | null): Promise<Song> {
  const form = new FormData();
  form.append("file", file);
  form.append("fileName", file.name.slice(0, 255));
  if (durationSeconds !== null) form.append("durationSeconds", String(durationSeconds));
  return (
    await api.post<Song>(`${SONGS}/${id}/audio`, form, { headers: { "Content-Type": "multipart/form-data" } })
  ).data;
}

export async function removeSongAudio(id: string): Promise<Song> {
  return (await api.delete<Song>(`${SONGS}/${id}/audio`)).data;
}

export async function markSongReady(id: string): Promise<Song> {
  return (await api.post<Song>(`${SONGS}/${id}/ready`)).data;
}

export async function unmarkSongReady(id: string): Promise<Song> {
  return (await api.delete<Song>(`${SONGS}/${id}/ready`)).data;
}

export async function deleteSong(id: string): Promise<void> {
  await api.delete(`${SONGS}/${id}`);
}

// --- roteiro -------------------------------------------------------------------

export type MomentKind = "PRE_SERVICE" | "GENERIC" | "WORSHIP" | "SERMON";

export interface TemplateMoment {
  name: string;
  kind: MomentKind;
  durationMinutes: number;
}

export interface ServiceTemplate {
  /** null: o Culto padrão embutido. */
  id: string | null;
  name: string;
  startTime: string;
  moments: TemplateMoment[];
}

export interface ServiceMoment extends TemplateMoment {
  id: string;
  startsAt: string;
  effectiveMinutes: number;
}

export interface ServiceSong extends SongSummary {
  /** Id da entrada no roteiro (a mesma música pode entrar duas vezes). */
  entryId: string;
}

export interface ServiceSummary {
  id: string;
  date: string;
  startTime: string;
  name: string;
  songCount: number;
  hasSermon: boolean;
}

export interface ServicePlan {
  id: string;
  date: string;
  startTime: string;
  name: string;
  templateId: string | null;
  moments: ServiceMoment[];
  endsAt: string;
  worshipStartsAt: string | null;
  songs: ServiceSong[];
  /** Palavra enviada para este culto (nulo = nenhuma). */
  sermon: { title: string; preacherName: string; estimatedMinutes: number } | null;
  updatedAt: string;
}

export async function fetchTemplates(): Promise<ServiceTemplate[]> {
  return (await api.get<{ items: ServiceTemplate[] }>(TEMPLATES)).data.items;
}

export async function saveServiceAsTemplate(serviceId: string, name: string): Promise<ServiceTemplate> {
  return (await api.post<ServiceTemplate>(TEMPLATES, { name, fromServiceId: serviceId })).data;
}

export async function fetchServices(): Promise<ServiceSummary[]> {
  return (await api.get<{ items: ServiceSummary[] }>(SERVICES)).data.items;
}

export async function fetchService(id: string): Promise<ServicePlan> {
  return (await api.get<ServicePlan>(`${SERVICES}/${id}`)).data;
}

export async function createService(input: {
  date: string;
  startTime?: string;
  templateId?: string | null;
}): Promise<ServicePlan> {
  const body: { date: string; startTime?: string; templateId?: string } = { date: input.date };
  if (input.startTime) body.startTime = input.startTime;
  if (input.templateId) body.templateId = input.templateId;
  return (await api.post<ServicePlan>(SERVICES, body)).data;
}

export async function deleteService(id: string): Promise<void> {
  await api.delete(`${SERVICES}/${id}`);
}

export async function setServiceMoments(
  id: string,
  moments: { id?: string; name: string; kind: MomentKind; durationMinutes: number }[],
): Promise<ServicePlan> {
  const body = {
    moments: moments.map((m) => {
      const item: { id?: string; name: string; kind: MomentKind; durationMinutes: number } = {
        name: m.name,
        kind: m.kind,
        durationMinutes: m.durationMinutes,
      };
      if (m.id) item.id = m.id;
      return item;
    }),
  };
  return (await api.put<ServicePlan>(`${SERVICES}/${id}/moments`, body)).data;
}

export async function setServiceSongs(id: string, songIds: string[]): Promise<ServicePlan> {
  return (await api.put<ServicePlan>(`${SERVICES}/${id}/songs`, { songIds: [...songIds] })).data;
}
