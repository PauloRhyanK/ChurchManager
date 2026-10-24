import { SCHEDULE_DAYS } from '../events/dto/create-schedule.dto';
import { formatDateOnly } from '../events/event-format.util';

/** Dias da agenda do telão, a contar de hoje. */
export const PROJECTION_DAYS = 7;

export interface ProjectionAgendaItem {
  /** "event:<id>" ou "schedule:<id>:<YYYY-MM-DD>". */
  key: string;
  kind: 'event' | 'schedule';
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

/** Aviso sem data (ex.: células), mostrado numa tela própria do telão. */
export interface ProjectionTopic {
  id: string;
  title: string;
  text: string;
  callToAction: string | null;
  active: boolean;
}

function isTopic(value: unknown): value is ProjectionTopic {
  const v = value as Partial<ProjectionTopic> | null;
  return (
    typeof v?.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.text === 'string' &&
    (v.callToAction === null || typeof v.callToAction === 'string') &&
    typeof v.active === 'boolean'
  );
}

/** Tópicos guardados (JSON) → lista tipada; entradas malformadas são ignoradas. */
export function readTopics(stored: unknown): ProjectionTopic[] {
  return Array.isArray(stored) ? stored.filter(isTopic) : [];
}

export interface ScheduleLike {
  id: string;
  title: string;
  dayOfWeek: string;
  timeStart: Date;
  location: string | null;
  description: string | null;
  active: boolean;
}

export interface EventLike {
  id: string;
  title: string;
  date: Date;
  timeStart: Date | null;
  timeEnd: Date | null;
  location: string | null;
  shortDescription: string | null;
  published: boolean;
}

/** Date @db.Time → "HH:MM". */
function hhmm(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(11, 16);
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function compare(a: ProjectionAgendaItem, b: ProjectionAgendaItem): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.timeStart ?? '').localeCompare(b.timeStart ?? '') ||
    (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1) ||
    a.title.localeCompare(b.title, 'pt-BR')
  );
}

/**
 * Agenda do telão: horários semanais ativos expandidos em ocorrências datadas
 * nos próximos `days` dias, mais os eventos publicados de hoje em diante, em
 * ordem cronológica. `today` é a data civil de hoje (meia-noite UTC), como
 * devolve `startOfTodayInTimeZone`.
 */
export function buildProjectionAgenda(input: {
  today: Date;
  schedules: ScheduleLike[];
  events: EventLike[];
  hiddenEventIds: readonly string[];
  hiddenScheduleIds: readonly string[];
  days?: number;
}): ProjectionAgendaItem[] {
  const days = input.days ?? PROJECTION_DAYS;
  const hiddenEvents = new Set(input.hiddenEventIds);
  const hiddenSchedules = new Set(input.hiddenScheduleIds);
  const todayIso = formatDateOnly(input.today);
  const items: ProjectionAgendaItem[] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(input.today.getTime() + offset * 86_400_000);
    const dayName = SCHEDULE_DAYS[date.getUTCDay()];
    const iso = formatDateOnly(date);
    for (const schedule of input.schedules) {
      if (!schedule.active || schedule.dayOfWeek !== dayName) continue;
      items.push({
        key: `schedule:${schedule.id}:${iso}`,
        kind: 'schedule',
        sourceId: schedule.id,
        title: schedule.title.trim(),
        date: iso,
        timeStart: hhmm(schedule.timeStart),
        timeEnd: null,
        location: text(schedule.location),
        note: text(schedule.description),
        hidden: hiddenSchedules.has(schedule.id),
      });
    }
  }

  for (const event of input.events) {
    const iso = formatDateOnly(event.date);
    if (!event.published || iso < todayIso) continue;
    items.push({
      key: `event:${event.id}`,
      kind: 'event',
      sourceId: event.id,
      title: event.title.trim(),
      date: iso,
      timeStart: hhmm(event.timeStart),
      timeEnd: hhmm(event.timeEnd),
      location: text(event.location),
      note: text(event.shortDescription),
      hidden: hiddenEvents.has(event.id),
    });
  }

  return items.sort(compare);
}
