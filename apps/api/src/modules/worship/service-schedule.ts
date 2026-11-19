import type { MomentKind } from './dto/service.dto';

export interface TemplateMoment {
  name: string;
  kind: MomentKind;
  durationMinutes: number;
}

/** Modelo embutido, oferecido enquanto a igreja não salva os seus. */
export const DEFAULT_TEMPLATE: { name: string; startTime: string; moments: TemplateMoment[] } = {
  name: 'Culto padrão',
  startTime: '19:00',
  moments: [
    { name: 'Pré-culto', kind: 'PRE_SERVICE', durationMinutes: 15 },
    { name: 'Abertura', kind: 'GENERIC', durationMinutes: 5 },
    { name: 'Louvor', kind: 'WORSHIP', durationMinutes: 17 },
    { name: 'Avisos', kind: 'GENERIC', durationMinutes: 5 },
    { name: 'Ofertório', kind: 'GENERIC', durationMinutes: 5 },
    { name: 'Palavra', kind: 'SERMON', durationMinutes: 40 },
    { name: 'Encerramento', kind: 'GENERIC', durationMinutes: 5 },
  ],
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toClock = (minutes: number) => {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
};

/**
 * Horário de cada momento. Os PRE_SERVICE do começo contam para trás a partir
 * do início do culto; o resto, para a frente. O primeiro momento WORSHIP dura
 * a soma dos áudios das músicas quando todas têm áudio; senão, a duração dele.
 */
export function computeSchedule<T extends TemplateMoment>(
  startTime: string,
  moments: T[],
  songDurations: (number | null)[],
): { moments: (T & { startsAt: string; effectiveMinutes: number })[]; endsAt: string; worshipStartsAt: string | null } {
  const allTimed = songDurations.length > 0 && songDurations.every((d) => typeof d === 'number' && d > 0);
  const songsMinutes = allTimed ? Math.ceil(songDurations.reduce<number>((a, d) => a + (d ?? 0), 0) / 60) : null;
  const firstWorship = moments.findIndex((m) => m.kind === 'WORSHIP');
  const effective = moments.map((m, i) =>
    i === firstWorship && songsMinutes !== null ? songsMinutes : m.durationMinutes,
  );

  let leading = 0;
  while (leading < moments.length && moments[leading].kind === 'PRE_SERVICE') leading += 1;
  let clock = toMinutes(startTime) - effective.slice(0, leading).reduce((a, b) => a + b, 0);

  let worshipStartsAt: string | null = null;
  const out = moments.map((m, i) => {
    const startsAt = toClock(clock);
    if (i === firstWorship) worshipStartsAt = startsAt;
    clock += effective[i];
    return { ...m, startsAt, effectiveMinutes: effective[i] };
  });
  return { moments: out, endsAt: toClock(clock), worshipStartsAt };
}
