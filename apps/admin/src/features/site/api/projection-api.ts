import { api } from "@/lib/api";

export interface ProjectionAgendaItem {
  /** "event:<id>" ou "schedule:<id>:<YYYY-MM-DD>". */
  key: string;
  kind: "event" | "schedule";
  /** Id do evento ou do horário semanal. */
  sourceId: string;
  title: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  note: string | null;
  hidden: boolean;
}

export interface ProjectionAgendaDto {
  items: ProjectionAgendaItem[];
  days: number;
  updatedAt: string | null;
}

export interface ProjectionSettingsBody {
  hiddenEventIds: string[];
  hiddenScheduleIds: string[];
}

const BASE = "/admin/tenants/me/projection";

export async function fetchProjectionAgenda() {
  const { data } = await api.get<ProjectionAgendaDto>(`${BASE}/agenda`);
  return data;
}

export async function updateProjectionSettings(body: ProjectionSettingsBody) {
  const { data } = await api.put<ProjectionAgendaDto>(`${BASE}/settings`, {
    hiddenEventIds: [...body.hiddenEventIds],
    hiddenScheduleIds: [...body.hiddenScheduleIds],
  });
  return data;
}
