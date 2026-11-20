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
const toClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
};

export interface ScheduleItem {
  kind: MomentKind;
  durationMinutes: number;
  /** Só em SONG com música: a duração do áudio, em segundos (vale no lugar da duração do item). */
  songSeconds?: number | null;
}

/**
 * Horário de cada item do roteiro, na ordem. Os PRE_SERVICE do começo contam
 * para trás a partir do início do culto; o resto, para a frente. Música com
 * áudio dura o áudio (contado em segundos, para cinco músicas de 4:10 não
 * virarem 25 min); o resto dura o que foi escrito.
 */
export function computeSchedule<T extends ScheduleItem>(
  startTime: string,
  moments: T[],
): {
  moments: (T & { startsAt: string; effectiveMinutes: number; effectiveSeconds: number })[];
  endsAt: string;
  worshipStartsAt: string | null;
} {
  const seconds = moments.map((m) =>
    m.kind === 'SONG' && typeof m.songSeconds === 'number' && m.songSeconds > 0 ? Math.round(m.songSeconds) : m.durationMinutes * 60,
  );
  let leading = 0;
  while (leading < moments.length && moments[leading].kind === 'PRE_SERVICE') leading += 1;
  let clock = toMinutes(startTime) * 60 - seconds.slice(0, leading).reduce((a, b) => a + b, 0);

  let worshipStartsAt: string | null = null;
  const out = moments.map((m, i) => {
    const startsAt = toClock(clock);
    if (worshipStartsAt === null && (m.kind === 'SONG' || m.kind === 'WORSHIP')) worshipStartsAt = startsAt;
    clock += seconds[i];
    return { ...m, startsAt, effectiveSeconds: seconds[i], effectiveMinutes: Math.max(1, Math.round(seconds[i] / 60)) };
  });
  return { moments: out, endsAt: toClock(clock), worshipStartsAt };
}
