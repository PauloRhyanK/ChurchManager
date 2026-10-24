import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/access/hooks/use-permissions";
import {
  fetchBranches,
  fetchPastors,
  fetchSchedules,
  type BranchDto,
  type PastorDto,
  type ScheduleDto,
} from "@/features/church/api/church-api";
import { fetchEvents, type EventDto } from "@/features/events/api/tenant-events-api";
import { todayDateInputMin } from "@/features/events/lib/event-form-validation";
import type { PreviewKind } from "./site-flow-blocks";

const MAX_ITEMS = 3;

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const EMPTY_TEXT: Record<PreviewKind, string> = {
  schedules: "Nenhum horário ativo",
  events: "Nenhum evento publicado: a seção fica oculta no site",
  branches: "Nenhuma filial ativa",
  pastors: "Nenhum pastor ativo",
};

/** "09:00:00" → "9h", "18:30" → "18h30". */
function formatTime(time: string): string {
  const [hours = "", minutes = "00"] = time.split(":");
  const h = Number.parseInt(hours, 10);
  if (Number.isNaN(h)) return time;
  return minutes === "00" ? `${h}h` : `${h}h${minutes}`;
}

/** Um item por dia: "Dom 9h e 18h30". */
export function scheduleLines(items: ScheduleDto[]): string[] {
  const byDay = new Map<number, string[]>();
  const sorted = items
    .filter((item) => item.active)
    .map((item) => ({ item, day: DAYS.indexOf(item.dayOfWeek) }))
    .sort((a, b) => a.day - b.day || a.item.timeStart.localeCompare(b.item.timeStart));
  for (const { item, day } of sorted) {
    const times = byDay.get(day) ?? [];
    times.push(formatTime(item.timeStart));
    byDay.set(day, times);
  }
  return [...byDay.entries()].map(([day, times]) => {
    const label = day >= 0 ? DAYS[day].slice(0, 3) : "";
    return `${label} ${times.join(" e ")}`.trim();
  });
}

export function eventLines(items: EventDto[]): string[] {
  const today = todayDateInputMin();
  return items
    .filter((event) => event.published && event.date.slice(0, 10) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((event) => {
      const date = new Date(`${event.date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
      });
      return `${event.title} (${date})`;
    });
}

/** "Igreja Paraíso — Itaguaçu" → "Itaguaçu": o prefixo se repete em todas. */
function shortBranchName(name: string): string {
  const parts = name.split(" — ");
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

export function branchLines(items: BranchDto[]): string[] {
  return items
    .filter((branch) => branch.active)
    .sort(
      (a, b) =>
        Number(b.isHeadquarters) - Number(a.isHeadquarters) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    )
    .map((branch) => shortBranchName(branch.name));
}

export function pastorLines(items: PastorDto[]): string[] {
  return items
    .filter((pastor) => pastor.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((pastor) => pastor.name);
}

/**
 * Prévia só de leitura dos dados que a seção puxa de outra aba, usando as
 * mesmas consultas (e o mesmo cache) das abas de origem. Sem permissão para
 * ver a origem, não mostra nada.
 */
export function SiteSourcePreview({ kind }: { kind: PreviewKind }) {
  const { can } = usePermissions();
  const canChurch = can("CHURCH", "VIEW");
  const canEvents = can("EVENTS", "VIEW");

  const schedules = useQuery({
    queryKey: ["schedules"],
    queryFn: fetchSchedules,
    enabled: kind === "schedules" && canChurch,
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches,
    enabled: kind === "branches" && canChurch,
  });
  const pastors = useQuery({
    queryKey: ["pastors"],
    queryFn: fetchPastors,
    enabled: kind === "pastors" && canChurch,
  });
  const events = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    enabled: kind === "events" && canEvents,
  });

  let lines: string[] | undefined;
  if (kind === "schedules" && canChurch) lines = schedules.data && scheduleLines(schedules.data);
  if (kind === "branches" && canChurch) lines = branches.data && branchLines(branches.data);
  if (kind === "pastors" && canChurch) lines = pastors.data && pastorLines(pastors.data);
  if (kind === "events" && canEvents) lines = events.data && eventLines(events.data);
  if (!lines) return null;

  const rest = lines.length - MAX_ITEMS;
  const text =
    lines.length === 0
      ? EMPTY_TEXT[kind]
      : `${lines.slice(0, MAX_ITEMS).join(" · ")}${rest > 0 ? ` +${rest}` : ""}`;

  return <p className="truncate text-xs text-muted-foreground">{text}</p>;
}
