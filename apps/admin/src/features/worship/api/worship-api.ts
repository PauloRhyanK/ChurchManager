import { api } from "@/lib/api";
import type { PublicSlide, SlideStyle } from "@/features/sermons/lib/slides";
import { MAX_PART_NAME, type Mood, type Pending, type RowPart, type SongStatus, type WorshipRow } from "../lib/document";

export interface SongAudio {
  url: string;
  fileName: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
}

export interface YoutubeSearchResult {
  id: string;
  title: string;
  channel: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
}

export interface YoutubeImportResponse {
  title: string;
  lyrics: string;
  audio: SongAudio;
}

export interface SongSummary {
  id: string;
  title: string;
  artist: string | null;
  musicalKey: string | null;
  bpm: number | null;
  timeSignature: string | null;
  /** Id da música no acervo do Holyrics do PC da igreja. */
  holyricsId: string | null;
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

export async function createSong(input: {
  title: string;
  rawLyrics?: string;
  organize?: boolean;
  audio?: { url: string; fileName?: string | null; durationSeconds?: number | null; sizeBytes?: number | null };
}): Promise<Song> {
  const body: {
    title: string;
    rawLyrics?: string;
    organize?: boolean;
    audio?: { url: string; fileName?: string; durationSeconds?: number; sizeBytes?: number };
  } = { title: input.title };
  if (input.rawLyrics !== undefined) body.rawLyrics = input.rawLyrics;
  if (input.organize !== undefined) body.organize = input.organize;
  if (input.audio) {
    body.audio = {
      url: input.audio.url,
      ...(input.audio.fileName ? { fileName: input.audio.fileName } : {}),
      ...(typeof input.audio.durationSeconds === "number" ? { durationSeconds: input.audio.durationSeconds } : {}),
      ...(typeof input.audio.sizeBytes === "number" ? { sizeBytes: input.audio.sizeBytes } : {}),
    };
  }
  return (await api.post<Song>(SONGS, body)).data;
}

export async function searchYoutube(q: string): Promise<YoutubeSearchResult[]> {
  return (await api.get<YoutubeSearchResult[]>(`${SONGS}/youtube/search`, { params: { q } })).data;
}

export async function importYoutube(urlOrId: string): Promise<YoutubeImportResponse> {
  return (await api.post<YoutubeImportResponse>(`${SONGS}/youtube/import`, { urlOrId })).data;
}

export async function setSongYoutubeAudio(id: string, urlOrId: string): Promise<Song> {
  return (await api.post<Song>(`${SONGS}/${id}/youtube`, { urlOrId })).data;
}

export interface SongInfoBody {
  title: string;
  artist: string | null;
  musicalKey: string | null;
  bpm: number | null;
  timeSignature: string | null;
  holyricsId: string | null;
}

export async function updateSongInfo(id: string, info: SongInfoBody): Promise<Song> {
  const body: SongInfoBody = {
    title: info.title,
    artist: info.artist,
    musicalKey: info.musicalKey,
    bpm: info.bpm,
    timeSignature: info.timeSignature,
    holyricsId: info.holyricsId,
  };
  return (await api.put<Song>(`${SONGS}/${id}`, body)).data;
}

function partBody(part: RowPart): RowPart {
  const body: RowPart = { kind: part.kind, mood: part.mood };
  if (part.name?.trim()) body.name = part.name.trim().slice(0, MAX_PART_NAME);
  return body;
}

/** Só os campos de cada linha que a API aceita, montados um a um. */
function rowBody(row: WorshipRow): WorshipRow {
  const body: WorshipRow = { id: row.id, type: row.type };
  if (row.type === "break") {
    // Linha esvaziada que abria parte ou slide: o servidor passa parte e tempo para a seguinte.
    if (row.part) body.part = partBody(row.part);
    if (typeof row.time === "number") {
      body.time = row.time;
      body.timeSource = row.timeSource ?? "MANUAL";
    }
    return body;
  }
  body.text = (row.text ?? "").slice(0, 200);
  if (row.type === "cue") body.target = row.target ?? "ALL";
  if (row.part) body.part = partBody(row.part);
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

// --- ligação com a Ponte do Culto ------------------------------------------------

export interface PonteKeyStatus {
  active: boolean;
  /** Últimos caracteres da chave em uso, para reconhecer qual é. */
  hint: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  /** Caminho que a Ponte consulta, relativo à base da API. */
  path: string;
}

const PONTE_KEY = "/admin/tenants/me/worship/ponte-key";

export async function fetchPonteKey(): Promise<PonteKeyStatus> {
  return (await api.get<PonteKeyStatus>(PONTE_KEY)).data;
}

/** Gera uma chave nova. A chave em si só vem nesta resposta. */
export async function generatePonteKey(): Promise<PonteKeyStatus & { key: string }> {
  return (await api.post<PonteKeyStatus & { key: string }>(PONTE_KEY)).data;
}

export async function revokePonteKey(): Promise<PonteKeyStatus> {
  return (await api.delete<PonteKeyStatus>(PONTE_KEY)).data;
}

// --- roteiro -------------------------------------------------------------------

export type MomentKind = "PRE_SERVICE" | "GENERIC" | "WORSHIP" | "SERMON" | "SONG";

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

/** Um item do roteiro: momento ou música (kind SONG), na ordem do culto. */
export interface ServiceMoment extends TemplateMoment {
  id: string;
  startsAt: string;
  effectiveMinutes: number;
  effectiveSeconds: number;
  /** Só em SONG; nulo = espaço reservado para música. */
  songId: string | null;
  song: (SongSummary & { mood: Mood | null }) | null;
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
  sermon: { title: string; preacherName: string; estimatedMinutes: number; slideCount: number } | null;
  updatedAt: string;
}

export async function fetchTemplates(): Promise<ServiceTemplate[]> {
  return (await api.get<{ items: ServiceTemplate[] }>(TEMPLATES)).data.items;
}

export async function saveServiceAsTemplate(serviceId: string, name: string): Promise<ServiceTemplate> {
  return (await api.post<ServiceTemplate>(TEMPLATES, { name, fromServiceId: serviceId })).data;
}

export interface TemplateBody {
  name: string;
  startTime: string;
  moments: TemplateMoment[];
}

/** Só os campos que a API aceita, montados um a um. */
function templateBody(input: TemplateBody): TemplateBody {
  return {
    name: input.name,
    startTime: input.startTime,
    moments: input.moments.map((m) => ({ name: m.name, kind: m.kind, durationMinutes: m.durationMinutes })),
  };
}

export async function createTemplate(input: TemplateBody): Promise<ServiceTemplate> {
  return (await api.post<ServiceTemplate>(TEMPLATES, templateBody(input))).data;
}

export async function updateTemplate(id: string, input: TemplateBody): Promise<ServiceTemplate> {
  return (await api.put<ServiceTemplate>(`${TEMPLATES}/${id}`, templateBody(input))).data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`${TEMPLATES}/${id}`);
}

export async function fetchServices(): Promise<ServiceSummary[]> {
  return (await api.get<{ items: ServiceSummary[] }>(SERVICES)).data.items;
}

export async function fetchService(id: string): Promise<ServicePlan> {
  return (await api.get<ServicePlan>(`${SERVICES}/${id}`)).data;
}

/** Prévia da palavra do culto (só a parte pública dos slides). `mySermonId` só vem para o autor. */
export interface ServiceSermonPreview {
  title: string;
  preacherName: string;
  slideStyle: SlideStyle;
  slides: PublicSlide[];
  mySermonId: string | null;
}

export async function getServiceSermon(serviceId: string): Promise<ServiceSermonPreview> {
  return (await api.get<ServiceSermonPreview>(`${SERVICES}/${serviceId}/sermon`)).data;
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

export interface RoteiroItemBody {
  id?: string;
  name: string;
  kind: MomentKind;
  durationMinutes: number;
  songId?: string | null;
}

export async function setServiceMoments(id: string, moments: RoteiroItemBody[]): Promise<ServicePlan> {
  const body = {
    moments: moments.map((m) => {
      const item: RoteiroItemBody = { name: m.name, kind: m.kind, durationMinutes: m.durationMinutes };
      if (m.id) item.id = m.id;
      if (m.kind === "SONG" && m.songId) item.songId = m.songId;
      return item;
    }),
  };
  return (await api.put<ServicePlan>(`${SERVICES}/${id}/moments`, body)).data;
}

export async function setServiceSongs(id: string, songIds: string[]): Promise<ServicePlan> {
  return (await api.put<ServicePlan>(`${SERVICES}/${id}/songs`, { songIds: [...songIds] })).data;
}

// --- tempos dos slides: antecipação, ajuste por IA e aprendizado ---------------

const TIMING = "/admin/tenants/me/worship/timing";

export interface TimingSettings {
  slideLeadSeconds: number;
  aiEnabled: boolean;
}

export async function fetchTimingSettings(): Promise<TimingSettings> {
  return (await api.get<TimingSettings>(`${TIMING}/settings`)).data;
}

export async function saveTimingSettings(slideLeadSeconds: number): Promise<TimingSettings> {
  const body: { slideLeadSeconds: number } = { slideLeadSeconds };
  return (await api.put<TimingSettings>(`${TIMING}/settings`, body)).data;
}

export interface LearnedTiming {
  corrections: number;
  meanFineDeltaSeconds: number | null;
  slideShifts: { earlier: number; later: number };
}

export async function fetchLearnedTiming(): Promise<LearnedTiming> {
  return (await api.get<LearnedTiming>(`${TIMING}/learned`)).data;
}

export interface TimingSuggestion {
  before: (number | null)[];
  times: (number | null)[];
  summary: string;
  slideIds: string[];
}

export async function suggestTiming(songId: string, instruction: string): Promise<TimingSuggestion> {
  const body: { instruction: string } = { instruction };
  return (await api.post<TimingSuggestion>(`${TIMING}/songs/${songId}/suggest`, body)).data;
}

export type TimingCorrectionSource = "DRAG" | "NUDGE" | "SHIFT_SECONDS" | "SHIFT_SLIDES" | "INSTRUCTION";

export async function recordTimingCorrection(
  songId: string,
  input: { source: TimingCorrectionSource; before: (number | null)[]; after: (number | null)[]; instruction?: string },
): Promise<void> {
  const body: typeof input = { source: input.source, before: input.before, after: input.after };
  if (input.instruction) body.instruction = input.instruction;
  await api.post(`${TIMING}/songs/${songId}/corrections`, body);
}
