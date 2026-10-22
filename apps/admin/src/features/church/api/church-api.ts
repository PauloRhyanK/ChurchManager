import { api } from "@/lib/api";

export interface BranchDto {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  image: string | null;
  mapsUrl: string | null;
  isHeadquarters: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PastorDto {
  id: string;
  name: string;
  image: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MinistryDto {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChurchConfigDto {
  id: string;
  tenantId: string;
  pixKey: string | null;
  bankName: string | null;
  bankCode: string | null;
  agency: string | null;
  account: string | null;
  holderName: string | null;
  holderDocument: string | null;
  youtubeUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleDto {
  id: string;
  title: string;
  dayOfWeek: string;
  timeStart: string; // "HH:MM:SS" ou similar
  location: string | null;
  description: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

// Corpos de escrita: só os campos que a API aceita (ValidationPipe com
// forbidNonWhitelisted recusa id/tenantId/createdAt/updatedAt que o GET devolve).
export type BranchBody = {
  name: string;
  location?: string | null;
  address?: string | null;
  image?: string | null;
  mapsUrl?: string | null;
  isHeadquarters?: boolean;
  active?: boolean;
  sortOrder?: number;
};

export type PastorBody = {
  name: string;
  image?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export type MinistryBody = {
  name: string;
  description?: string | null;
  icon?: string | null;
  image?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export type ScheduleBody = {
  title: string;
  dayOfWeek: string;
  timeStart: string;
  location?: string | null;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
};

/** Copia só as chaves listadas que estejam definidas em `source`. */
function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export function toBranchBody(source: Partial<BranchDto>): BranchBody {
  return {
    name: source.name ?? "",
    ...pick(source, ["location", "address", "image", "mapsUrl", "isHeadquarters", "active", "sortOrder"] as const),
  };
}

export function toPastorBody(source: Partial<PastorDto>): PastorBody {
  return { name: source.name ?? "", ...pick(source, ["image", "active", "sortOrder"] as const) };
}

export function toMinistryBody(source: Partial<MinistryDto>): MinistryBody {
  return {
    name: source.name ?? "",
    ...pick(source, ["description", "icon", "image", "active", "sortOrder"] as const),
  };
}

export function toScheduleBody(source: Partial<ScheduleDto>): ScheduleBody {
  return {
    title: source.title ?? "",
    dayOfWeek: source.dayOfWeek ?? "",
    timeStart: source.timeStart ?? "",
    ...pick(source, ["location", "description", "active", "sortOrder"] as const),
  };
}

// Branches API
export async function fetchBranches() {
  const { data } = await api.get<{ items: BranchDto[] }>("/admin/tenants/me/branches");
  return data.items;
}

export async function createBranch(payload: BranchBody) {
  const { data } = await api.post<BranchDto>("/admin/tenants/me/branches", payload);
  return data;
}

export async function updateBranch(id: string, payload: BranchBody) {
  const { data } = await api.put<BranchDto>(`/admin/tenants/me/branches/${id}`, payload);
  return data;
}

export async function deleteBranch(id: string) {
  await api.delete(`/admin/tenants/me/branches/${id}`);
}

// Pastors API
export async function fetchPastors() {
  const { data } = await api.get<{ items: PastorDto[] }>("/admin/tenants/me/pastors");
  return data.items;
}

export async function createPastor(payload: PastorBody) {
  const { data } = await api.post<PastorDto>("/admin/tenants/me/pastors", payload);
  return data;
}

export async function updatePastor(id: string, payload: PastorBody) {
  const { data } = await api.put<PastorDto>(`/admin/tenants/me/pastors/${id}`, payload);
  return data;
}

export async function deletePastor(id: string) {
  await api.delete(`/admin/tenants/me/pastors/${id}`);
}

// Ministries API
export async function fetchMinistries() {
  const { data } = await api.get<{ items: MinistryDto[] }>("/admin/tenants/me/ministries");
  return data.items;
}

export async function createMinistry(payload: MinistryBody) {
  const { data } = await api.post<MinistryDto>("/admin/tenants/me/ministries", payload);
  return data;
}

export async function updateMinistry(id: string, payload: MinistryBody) {
  const { data } = await api.put<MinistryDto>(`/admin/tenants/me/ministries/${id}`, payload);
  return data;
}

export async function deleteMinistry(id: string) {
  await api.delete(`/admin/tenants/me/ministries/${id}`);
}

// Schedules API
export async function fetchSchedules() {
  const { data } = await api.get<{ items: ScheduleDto[] }>("/admin/tenants/me/schedules");
  return data.items;
}

export async function createSchedule(payload: ScheduleBody) {
  const { data } = await api.post<ScheduleDto>("/admin/tenants/me/schedules", payload);
  return data;
}

export async function updateSchedule(id: string, payload: ScheduleBody) {
  const { data } = await api.put<ScheduleDto>(`/admin/tenants/me/schedules/${id}`, payload);
  return data;
}

export async function deleteSchedule(id: string) {
  await api.delete(`/admin/tenants/me/schedules/${id}`);
}

export type ChurchConfigBody = Partial<
  Omit<ChurchConfigDto, "id" | "tenantId" | "createdAt" | "updatedAt">
>;

// Church Config API
export async function fetchChurchConfig() {
  const { data } = await api.get<ChurchConfigDto>("/admin/tenants/me/church-config");
  return data;
}

export async function updateChurchConfig(payload: ChurchConfigBody) {
  const { data } = await api.put<ChurchConfigDto>("/admin/tenants/me/church-config", payload);
  return data;
}
