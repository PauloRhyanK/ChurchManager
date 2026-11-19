// O roteiro do culto como uma lista só: momentos e músicas na mesma ordem.
import { MOODS, deriveSong, type Mood, type WorshipRow } from './worship-document';
import type { MomentKind } from './dto/service.dto';

export interface RoteiroDraft {
  id?: string;
  name: string;
  kind: MomentKind;
  durationMinutes: number;
  songId: string | null;
}

/** Minutos que um item de música ocupa sem o áudio (ou pela duração do áudio, para cima). */
export const songMinutes = (audioSeconds: number | null | undefined) =>
  typeof audioSeconds === 'number' && audioSeconds > 0 ? Math.min(600, Math.max(1, Math.ceil(audioSeconds / 60))) : 5;

/**
 * Põe a lista de músicas (aba "Só as músicas") no roteiro, sem mexer na ordem
 * dos momentos: a 1ª música vai para o lugar da 1ª música que já estava, e
 * assim por diante; músicas a mais preenchem os espaços reservados vazios e,
 * depois, entram logo após a última música (ou no lugar do primeiro bloco
 * Louvor, se o culto ainda não tem música; ou no fim). Lugar de música que
 * sobrou sai do roteiro; espaço reservado vazio fica.
 */
export function placeSongs(
  current: RoteiroDraft[],
  songIds: string[],
  newSong: (songId: string) => RoteiroDraft,
): RoteiroDraft[] {
  const out: (RoteiroDraft | null)[] = current.map((m) => ({ ...m }));
  const filled = current.flatMap((m, i) => (m.kind === 'SONG' && m.songId ? [i] : []));
  const empty = current.flatMap((m, i) => (m.kind === 'SONG' && !m.songId ? [i] : []));
  const queue = [...songIds];
  for (const i of filled) {
    const next = queue.shift();
    if (next === undefined) out[i] = null;
    else out[i] = { ...(out[i] as RoteiroDraft), songId: next };
  }
  for (const i of empty) {
    const next = queue.shift();
    if (next === undefined) break;
    out[i] = { ...(out[i] as RoteiroDraft), songId: next };
  }
  let list = out.filter((m): m is RoteiroDraft => m !== null);
  if (queue.length) {
    const extra = queue.map(newSong);
    const lastSong = list.map((m) => m.kind).lastIndexOf('SONG');
    const worship = list.findIndex((m) => m.kind === 'WORSHIP');
    if (lastSong >= 0) list = [...list.slice(0, lastSong + 1), ...extra, ...list.slice(lastSong + 1)];
    else if (worship >= 0) list = [...list.slice(0, worship), ...extra, ...list.slice(worship + 1)];
    else list = [...list, ...extra];
  }
  return list;
}

/** O clima de uma música: o que mais aparece nas partes; no empate, o mais forte. */
export function songMood(rows: WorshipRow[]): Mood | null {
  const count = new Map<Mood, number>();
  for (const p of deriveSong(rows).parts) if (p.mood) count.set(p.mood, (count.get(p.mood) ?? 0) + 1);
  let best: Mood | null = null;
  for (const mood of MOODS) {
    if ((count.get(mood) ?? 0) > 0 && (best === null || (count.get(mood) ?? 0) >= (count.get(best) ?? 0))) best = mood;
  }
  return best;
}

/** As partes da música com início e fim no áudio (segundos), como a Ponte usa. */
export function songParts(rows: WorshipRow[], audioSeconds: number | null) {
  const { parts } = deriveSong(rows);
  return parts.map((p, i) => {
    const next = parts.slice(i + 1).find((q) => q.time !== null);
    return {
      indice: p.index,
      nome: p.name,
      kind: p.kind,
      inicioSeg: p.time,
      fimSeg: p.time === null ? null : (next?.time ?? audioSeconds ?? null),
    };
  });
}
