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

// Branches API
export async function fetchBranches() {
  const { data } = await api.get<{ items: BranchDto[] }>("/admin/tenants/me/branches");
  return data.items;
}

export async function createBranch(payload: Partial<BranchDto>) {
  const { data } = await api.post<BranchDto>("/admin/tenants/me/branches", payload);
  return data;
}

export async function updateBranch(id: string, payload: Partial<BranchDto>) {
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

export async function createPastor(payload: Partial<PastorDto>) {
  const { data } = await api.post<PastorDto>("/admin/tenants/me/pastors", payload);
  return data;
}

export async function updatePastor(id: string, payload: Partial<PastorDto>) {
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

export async function createMinistry(payload: Partial<MinistryDto>) {
  const { data } = await api.post<MinistryDto>("/admin/tenants/me/ministries", payload);
  return data;
}

export async function updateMinistry(id: string, payload: Partial<MinistryDto>) {
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

export async function createSchedule(payload: Partial<ScheduleDto>) {
  const { data } = await api.post<ScheduleDto>("/admin/tenants/me/schedules", payload);
  return data;
}

export async function updateSchedule(id: string, payload: Partial<ScheduleDto>) {
  const { data } = await api.put<ScheduleDto>(`/admin/tenants/me/schedules/${id}`, payload);
  return data;
}

export async function deleteSchedule(id: string) {
  await api.delete(`/admin/tenants/me/schedules/${id}`);
}

// Church Config API
export async function fetchChurchConfig() {
  const { data } = await api.get<ChurchConfigDto>("/admin/tenants/me/church-config");
  return data;
}

export async function updateChurchConfig(payload: Partial<ChurchConfigDto>) {
  const { data } = await api.put<ChurchConfigDto>("/admin/tenants/me/church-config", payload);
  return data;
}
