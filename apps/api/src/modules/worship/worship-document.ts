/**
 * O documento da letra de uma música e tudo o que se deriva dele.
 *
 * ESTE ARQUIVO EXISTE IGUAL EM DOIS LUGARES e não importa nada de fora:
 *   apps/api/src/modules/worship/worship-document.ts
 *   apps/admin/src/features/worship/lib/document.ts
 * Ao mudar um, copie para o outro (o teste de cada lado confere as regras).
 *
 * O documento é uma lista plana de linhas, na ordem da tela. Partes, slides,
 * situação e o texto do Holyrics são sempre derivados, nunca guardados.
 */

export const PART_KINDS = ['INTRO', 'VERSE', 'PRE_CHORUS', 'CHORUS', 'BRIDGE', 'INSTRUMENTAL', 'ENDING'] as const;
export type PartKind = (typeof PART_KINDS)[number];

export const MOODS = ['CONTEMPLATIVE', 'WORSHIP', 'BUILD', 'CELEBRATION', 'EXPLOSION'] as const;
export type Mood = (typeof MOODS)[number];

export const CUE_TARGETS = ['ALL', 'VOCAL', 'KEYS', 'ACOUSTIC_GUITAR', 'ELECTRIC_GUITAR', 'BASS', 'DRUMS'] as const;
export type CueTarget = (typeof CUE_TARGETS)[number];

export const TIME_SOURCES = ['MANUAL', 'AI'] as const;
export type TimeSource = (typeof TIME_SOURCES)[number];

export const MAX_ROWS = 600;
export const MAX_ROW_TEXT = 200;
export const MAX_TIME_SECONDS = 3600;

export interface RowPart {
  kind: PartKind;
  mood: Mood | null;
}

export interface WorshipRow {
  id: string;
  type: 'lyric' | 'cue' | 'break';
  /** Letra (lyric) ou o recado (cue). */
  text?: string;
  /** Só em cue: para quem é o recado. */
  target?: CueTarget;
  /** Esta linha abre uma parte. */
  part?: RowPart;
  /** Segundo do áudio em que o slide que começa nesta linha entra. */
  time?: number | null;
  timeSource?: TimeSource;
}

export interface DerivedPart {
  index: number;
  kind: PartKind;
  name: string;
  mood: Mood | null;
  /** Tempo do primeiro slide da parte. */
  time: number | null;
  firstSlide: number;
  slideCount: number;
  /** Id da linha que abre a parte. */
  rowId: string;
}

export interface DerivedSlide {
  index: number;
  part: number;
  /** Id da primeira linha do slide: é nela que o tempo mora. */
  rowId: string;
  time: number | null;
  timeSource: TimeSource | null;
  /** Linhas do telão, em maiúsculas. */
  lines: string[];
  cues: { target: CueTarget; text: string }[];
}

export type Pending = 'AUDIO' | 'TIMES' | 'MOODS' | 'CONFIRM';
export type SongStatus = 'DRAFT' | 'NEEDS_TIMING' | 'READY';

export const PART_KIND_LABEL: Record<PartKind, string> = {
  INTRO: 'Intro',
  VERSE: 'Verso',
  PRE_CHORUS: 'Pré-refrão',
  CHORUS: 'Refrão',
  BRIDGE: 'Ponte',
  INSTRUMENTAL: 'Instrumental',
  ENDING: 'Final',
};

export const CUE_TARGET_LABEL: Record<CueTarget, string> = {
  ALL: 'Todos',
  VOCAL: 'Vocal',
  KEYS: 'Teclado',
  ACOUSTIC_GUITAR: 'Violão',
  ELECTRIC_GUITAR: 'Guitarra',
  BASS: 'Baixo',
  DRUMS: 'Bateria',
};

export function newRowId(): string {
  return globalThis.crypto.randomUUID();
}

function isBlank(row: WorshipRow): boolean {
  return row.type === 'break' || (row.type === 'lyric' && !(row.text ?? '').trim());
}

/**
 * Clima sugerido por regra, a partir do tipo de cada parte. O último refrão,
 * quando há mais de um, é o ponto mais forte da música.
 */
export function suggestMoods(kinds: PartKind[]): Mood[] {
  const byKind: Record<PartKind, Mood> = {
    INTRO: 'CONTEMPLATIVE',
    VERSE: 'WORSHIP',
    PRE_CHORUS: 'BUILD',
    CHORUS: 'CELEBRATION',
    BRIDGE: 'BUILD',
    INSTRUMENTAL: 'WORSHIP',
    ENDING: 'CONTEMPLATIVE',
  };
  const moods = kinds.map((k) => byKind[k]);
  const choruses = kinds.map((k, i) => (k === 'CHORUS' ? i : -1)).filter((i) => i >= 0);
  if (choruses.length > 1) moods[choruses[choruses.length - 1]] = 'EXPLOSION';
  return moods;
}

/**
 * Deixa o documento num formato canônico: a primeira linha abre parte, não há
 * linha em branco nas pontas, repetida ou encostada num começo de parte, o
 * tempo só existe na primeira linha de cada slide e os ids são únicos.
 */
export function normalizeRows(input: WorshipRow[]): WorshipRow[] {
  const seen = new Set<string>();
  const out: WorshipRow[] = [];
  let carriedPart: RowPart | undefined;
  let carriedTime: { time: number; timeSource?: TimeSource } | undefined;

  for (const raw of input.slice(0, MAX_ROWS)) {
    let id = typeof raw.id === 'string' && raw.id ? raw.id : newRowId();
    if (seen.has(id)) id = newRowId();
    seen.add(id);

    if (isBlank(raw)) {
      // Uma linha apagada que abria parte ou slide passa a parte e o tempo para a seguinte
      // (se houver duas, vale a última, como em `deriveSong`).
      if (raw.part) carriedPart = raw.part;
      if (typeof raw.time === 'number' && Number.isFinite(raw.time)) {
        carriedTime = { time: raw.time, timeSource: raw.timeSource };
      }
      const last = out[out.length - 1];
      if (!last || last.type === 'break') continue;
      out.push({ id, type: 'break' });
      continue;
    }

    const part = raw.part ?? carriedPart;
    const inherited = typeof raw.time === 'number' ? undefined : carriedTime;
    carriedPart = undefined;
    carriedTime = undefined;
    const last = out[out.length - 1];
    if (part && last?.type === 'break') out.pop();

    const startsSlide = !!part || out.length === 0 || out[out.length - 1].type === 'break';
    const row: WorshipRow = {
      id,
      type: raw.type,
      text: (raw.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ROW_TEXT),
    };
    if (raw.type === 'cue') row.target = raw.target ?? 'ALL';
    if (part) row.part = { kind: part.kind, mood: part.mood ?? null };
    const time = typeof raw.time === 'number' ? raw.time : inherited?.time;
    if (startsSlide && typeof time === 'number' && Number.isFinite(time)) {
      row.time = Math.min(MAX_TIME_SECONDS, Math.max(0, Math.round(time * 100) / 100));
      row.timeSource = (typeof raw.time === 'number' ? raw.timeSource : inherited?.timeSource) ?? 'MANUAL';
    }
    out.push(row);
  }

  if (out[out.length - 1]?.type === 'break') out.pop();
  if (out.length && !out[0].part) out[0].part = { kind: 'VERSE', mood: null };
  return out;
}

/** Partes e slides, na ordem. Tolera documento ainda não normalizado. */
export function deriveSong(rows: WorshipRow[]): { parts: DerivedPart[]; slides: DerivedSlide[] } {
  const parts: DerivedPart[] = [];
  const slides: DerivedSlide[] = [];
  let slide: DerivedSlide | null = null;
  let pendingPart: RowPart | undefined;

  for (const row of rows) {
    if (isBlank(row)) {
      if (row.part) pendingPart = row.part;
      slide = null;
      continue;
    }
    const part = row.part ?? pendingPart;
    pendingPart = undefined;
    if (part || parts.length === 0) {
      parts.push({
        index: parts.length,
        kind: part?.kind ?? 'VERSE',
        name: '',
        mood: part?.mood ?? null,
        time: null,
        firstSlide: slides.length,
        slideCount: 0,
        rowId: row.id,
      });
      slide = null;
    }
    if (!slide) {
      slide = {
        index: slides.length,
        part: parts.length - 1,
        rowId: row.id,
        time: typeof row.time === 'number' ? row.time : null,
        timeSource: typeof row.time === 'number' ? (row.timeSource ?? 'MANUAL') : null,
        lines: [],
        cues: [],
      };
      slides.push(slide);
      parts[parts.length - 1].slideCount += 1;
    }
    if (row.type === 'cue') slide.cues.push({ target: row.target ?? 'ALL', text: (row.text ?? '').trim() });
    else slide.lines.push((row.text ?? '').trim().toLocaleUpperCase('pt-BR'));
  }

  let verse = 0;
  for (const part of parts) {
    part.name = part.kind === 'VERSE' ? `Verso ${++verse}` : PART_KIND_LABEL[part.kind];
    part.time = slides[part.firstSlide]?.time ?? null;
  }
  return { parts, slides };
}

/** O que ainda falta para a música poder ser marcada como pronta (sem o CONFIRM). */
export function songPending(
  rows: WorshipRow[],
  audio: { url: string | null; durationSeconds: number | null },
): Pending[] {
  const { parts, slides } = deriveSong(rows);
  if (!slides.length) return [];
  const pending: Pending[] = [];
  if (!audio.url) pending.push('AUDIO');
  let previous = -1;
  let timesOk = true;
  for (const s of slides) {
    if (s.time === null || s.time <= previous) timesOk = false;
    else if (audio.durationSeconds !== null && s.time > audio.durationSeconds) timesOk = false;
    if (s.time !== null) previous = s.time;
  }
  if (!timesOk) pending.push('TIMES');
  if (parts.some((p) => p.mood === null)) pending.push('MOODS');
  return pending;
}

export function songStatus(
  rows: WorshipRow[],
  audio: { url: string | null; durationSeconds: number | null },
  readyAt: Date | string | null,
): { status: SongStatus; pending: Pending[]; slideCount: number } {
  const slideCount = deriveSong(rows).slides.length;
  if (!slideCount) return { status: 'DRAFT', pending: [], slideCount };
  const pending = songPending(rows, audio);
  if (pending.length) return { status: 'NEEDS_TIMING', pending, slideCount };
  if (readyAt) return { status: 'READY', pending: [], slideCount };
  return { status: 'NEEDS_TIMING', pending: ['CONFIRM'], slideCount };
}

/** Texto pronto para colar no Holyrics: um bloco por slide, recados com `//`. */
export function holyricsText(rows: WorshipRow[]): string {
  return deriveSong(rows)
    .slides.map((s) =>
      [...s.cues.map((c) => `//${CUE_TARGET_LABEL[c.target]}${c.text ? `: ${c.text}` : ''}`), ...s.lines].join('\n'),
    )
    .join('\n\n');
}
