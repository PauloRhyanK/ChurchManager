import type { Event, EventRegistration, Schedule } from '@prisma/client';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formata Date @db.Date como YYYY-MM-DD. */
export function formatDateOnly(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

/** Formata Date @db.Time como HH:MM:SS. */
export function formatTimeOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}:${pad2(value.getUTCSeconds())}`;
}

/** Converte "YYYY-MM-DD" para Date @db.Date (UTC). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Converte "HH:MM" ou "HH:MM:SS" para Date @db.Time. */
export function parseTimeOnly(value: string | undefined | null): Date | null {
  if (value == null || String(value).trim() === '') return null;
  const parts = String(value).trim().split(':').map(Number);
  const h = parts[0] ?? 0;
  const min = parts[1] ?? 0;
  const sec = parts[2] ?? 0;
  return new Date(Date.UTC(1970, 0, 1, h, min, sec));
}

export type EventTagDto = { id: string; name: string; slug: string };

export function toEventDto(row: Event, tags: EventTagDto[] = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    onlineUrl: row.onlineUrl,
    shortDescription: row.shortDescription,
    detailsHtml: row.detailsHtml,
    videoUrl: row.videoUrl,
    coverImageUrl: row.coverImageUrl ?? row.imageUrl,
    mediaMeta: row.mediaMeta ?? null,
    date: formatDateOnly(row.date),
    timeStart: formatTimeOnly(row.timeStart),
    timeEnd: formatTimeOnly(row.timeEnd),
    location: row.location,
    imageUrl: row.imageUrl,
    tag: row.tag,
    tags,
    published: row.published,
    slug: row.slug,
    timezone: row.timezone,
    registrationClosesAt: row.registrationClosesAt,
    termsUrl: row.termsUrl,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRegistrationDto(
  row: EventRegistration,
  event?: Pick<Event, 'title' | 'date' | 'tag'>,
) {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    userId: row.userId,
    createdAt: row.createdAt,
    ...(event
      ? {
          event: {
            title: event.title,
            date: formatDateOnly(event.date),
            tag: event.tag,
          },
        }
      : {}),
  };
}

export function toScheduleDto(row: Schedule) {
  return {
    id: row.id,
    title: row.title,
    dayOfWeek: row.dayOfWeek,
    timeStart: formatTimeOnly(row.timeStart)!,
    location: row.location,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Data legível em pt-BR a partir dos campos já normalizados (`YYYY-MM-DD` e
 * `HH:MM:SS`). Trabalha sobre as strings — não reinterpreta fusos.
 */
export function formatEventDateTimePtBr(
  date: string,
  timeStart: string | null,
): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS_PT[m - 1] ?? '';
  const day = `${d} de ${month} de ${y}`;
  if (!timeStart) return day;
  const [h, min] = timeStart.split(':');
  return `${day}, ${h}:${min}`;
}

/** Fuso dos eventos quando não há outro (igual ao default de `Event.timezone`). */
export const DEFAULT_EVENT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Fuso utilizável pelo `Intl`: um valor inválido (com que o `Intl` lança
 * `RangeError`) vira `DEFAULT_EVENT_TIMEZONE`, em vez de derrubar o pedido.
 */
export function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone;
  } catch (error) {
    if (error instanceof RangeError) {
      return DEFAULT_EVENT_TIMEZONE;
    }
    throw error;
  }
}

/**
 * "Hoje" no fuso indicado, como valor date-only (meia-noite UTC do dia civil
 * local), comparável com `Event.date` (@db.Date) — ver `parseDateOnly`.
 */
export function startOfTodayInTimeZone(
  timeZone = DEFAULT_EVENT_TIMEZONE,
  now = new Date(),
): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

/** Início do dia UTC para filtro date >= hoje. */
export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
