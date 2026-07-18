import { api } from "@/lib/api";

export type SiteFieldType =
  | "text"
  | "textarea"
  | "url"
  | "image"
  | "icon"
  | "boolean"
  | "list";

export interface SiteFieldSpec {
  name: string;
  label: string;
  type: SiteFieldType;
  help?: string;
  required?: boolean;
  maxLength?: number;
  itemLabel?: string;
  maxItems?: number;
  fields?: SiteFieldSpec[];
}

export interface SiteSectionSpec {
  key: string;
  title: string;
  description: string;
  icon: string;
  fields: SiteFieldSpec[];
}

export interface SiteSchemaDto {
  icons: string[];
  sections: SiteSectionSpec[];
}

export type SiteSectionValue = Record<string, unknown>;

export interface SiteSectionDto {
  key: string;
  title: string;
  description: string;
  icon: string;
  value: SiteSectionValue;
  updatedAt: string | null;
}

const BASE = "/admin/tenants/me/site-content";

export async function fetchSiteSchema() {
  const { data } = await api.get<SiteSchemaDto>(`${BASE}/schema`);
  return data;
}

export async function fetchSiteSections() {
  const { data } = await api.get<{ items: SiteSectionDto[] }>(BASE);
  return data.items;
}

export async function updateSiteSection(key: string, value: SiteSectionValue) {
  const { data } = await api.put<SiteSectionDto>(`${BASE}/${key}`, { value });
  return data;
}

export async function resetSiteSection(key: string) {
  const { data } = await api.delete<SiteSectionDto>(`${BASE}/${key}`);
  return data;
}

export const SITE_IMAGE_UPLOAD_PATH = `${BASE}/upload-image`;
