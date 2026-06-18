import { api } from "@/lib/api";

export type EventFieldType =
  | "TEXT"
  | "EMAIL"
  | "PHONE"
  | "CPF"
  | "TEXTAREA"
  | "SELECT"
  | "CHECKBOX";

export interface EventFieldDefinitionDto {
  id: string;
  key: string;
  label: string;
  type: EventFieldType;
  options: string[] | null;
  isSystem: boolean;
  createdAt: string;
}

export type CreateFieldBody = {
  label: string;
  type: EventFieldType;
  options?: string[];
};

export async function fetchEventFieldDefinitions() {
  const { data } = await api.get<{ items: EventFieldDefinitionDto[] }>(
    "/admin/tenants/me/event-field-definitions",
  );
  return data.items;
}

export async function createEventFieldDefinition(body: CreateFieldBody) {
  const { data } = await api.post<EventFieldDefinitionDto>(
    "/admin/tenants/me/event-field-definitions",
    body,
  );
  return data;
}

export async function deleteEventFieldDefinition(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(
    `/admin/tenants/me/event-field-definitions/${id}`,
  );
  return data;
}
