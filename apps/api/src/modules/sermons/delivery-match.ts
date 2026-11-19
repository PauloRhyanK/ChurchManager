export type MatchService = { id: string; startTime: string };
export type MatchDelivery = {
  id: string;
  startTime: string;
  createdAt: Date;
  pinned: boolean;
  serviceId: string | null;
};
export type SermonStatus = 'DRAFT' | 'SENT' | 'PREACHED';

const DEFAULT_TZ = 'America/Sao_Paulo';

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Para cada envio da data, o culto com que fica (ou null = guardado). */
export function matchDeliveries(
  services: MatchService[],
  deliveries: MatchDelivery[],
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const taken = new Set<string>();
  const known = new Set(services.map((s) => s.id));

  for (const d of deliveries) {
    if (d.pinned) {
      if (d.serviceId && known.has(d.serviceId) && !taken.has(d.serviceId)) {
        result.set(d.id, d.serviceId);
        taken.add(d.serviceId);
      } else {
        result.set(d.id, null);
      }
    }
  }

  const rest = deliveries
    .filter((d) => !d.pinned)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const d of rest) {
    const want = minutesOf(d.startTime);
    let best: MatchService | null = null;
    let bestDiff = Infinity;
    for (const s of services) {
      const diff = Math.abs(minutesOf(s.startTime) - want);
      if (diff < bestDiff || (diff === bestDiff && best && minutesOf(s.startTime) < minutesOf(best.startTime))) {
        best = s;
        bestDiff = diff;
      }
    }
    if (best && !taken.has(best.id)) {
      result.set(d.id, best.id);
      taken.add(best.id);
    } else {
      result.set(d.id, null);
    }
  }
  return result;
}

function resolveZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Deslocamento (ms) do fuso em relação a UTC no instante dado. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** date 'AAAA-MM-DD' e startTime 'HH:MM' no fuso timeZone. */
export function deliveryHasPassed(date: string, startTime: string, now: Date, timeZone: string): boolean {
  const zone = resolveZone(timeZone);
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = startTime.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let instant = wall - zoneOffsetMs(wall, zone);
  instant = wall - zoneOffsetMs(instant, zone);
  return now.getTime() >= instant;
}

export function sermonStatus(
  delivery: { date: string; startTime: string } | null,
  now: Date,
  timeZone: string,
): SermonStatus {
  if (!delivery) return 'DRAFT';
  return deliveryHasPassed(delivery.date, delivery.startTime, now, timeZone) ? 'PREACHED' : 'SENT';
}
