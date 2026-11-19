import {
  type CueTarget,
  type Mood,
  type PartKind,
  type RowPart,
  type WorshipRow,
  PART_KIND_LABEL,
  deriveSong,
  newRowId,
  suggestMoods,
} from "./document";

/**
 * Operações do editor da letra. Todas puras: recebem o documento e devolvem
 * outro. Índices são posições na lista de linhas.
 */

const isBreak = (row: WorshipRow | undefined) => !row || row.type === "break";
const startsSlide = (rows: WorshipRow[], index: number) =>
  index === 0 || !!rows[index].part || isBreak(rows[index - 1]);

/**
 * Instruções logo acima de uma linha pertencem a ela (são o recado daquele
 * trecho): devolve o índice da primeira instrução colada acima de `index`.
 */
function withLeadingCues(rows: WorshipRow[], index: number): number {
  let start = index;
  while (start > 0 && rows[start - 1].type === "cue" && !rows[start].part) start -= 1;
  return start;
}

/** A parte em vigor na linha `index` (a última aberta até ali). */
export function partAt(rows: WorshipRow[], index: number): RowPart {
  for (let i = Math.min(index, rows.length - 1); i >= 0; i--) {
    const part = rows[i]?.part;
    if (part) return { ...part };
  }
  return { kind: "VERSE", mood: null };
}

const defaultMood = (kind: PartKind): Mood => suggestMoods([kind])[0];

/** O trecho [from, to] passa a ser uma parte do tipo `kind`; o que sobra depois mantém o que era. */
export function setPartKind(rows: WorshipRow[], from: number, to: number, kind: PartKind): WorshipRow[] {
  while (from <= to && isBreak(rows[from])) from += 1;
  while (to >= from && isBreak(rows[to])) to -= 1;
  if (from > to || !rows[from]) return rows;
  from = withLeadingCues(rows, from);

  const out = rows.map((r) => ({ ...r }));
  const current = out[from].part;
  out[from].part = { kind, mood: current?.kind === kind ? current.mood : defaultMood(kind) };
  for (let i = from + 1; i <= to; i++) delete out[i].part;

  let next = to + 1;
  while (next < out.length && isBreak(out[next])) next += 1;
  if (next < out.length && !out[next].part) out[next].part = partAt(rows, next);
  return out;
}

/** Insere uma instrução antes da linha `beforeIndex`; ela passa a abrir o slide daquela linha. */
export function insertCue(rows: WorshipRow[], beforeIndex: number, target: CueTarget, text: string): WorshipRow[] {
  const index = Math.max(0, Math.min(beforeIndex, rows.length));
  const out = rows.map((r) => ({ ...r }));
  const cue: WorshipRow = { id: newRowId(), type: "cue", target, text: text.trim() };
  const following = out[index];
  if (following && !isBreak(following) && startsSlide(rows, index)) {
    // A instrução vira a primeira linha do slide: a parte e o tempo sobem para ela.
    if (following.part) cue.part = following.part;
    if (typeof following.time === "number") {
      cue.time = following.time;
      cue.timeSource = following.timeSource;
    }
    delete following.part;
    delete following.time;
    delete following.timeSource;
  }
  out.splice(index, 0, cue);
  return out;
}

export function updateCue(rows: WorshipRow[], id: string, target: CueTarget, text: string): WorshipRow[] {
  return rows.map((r) => (r.id === id && r.type === "cue" ? { ...r, target, text: text.trim() } : r));
}

/** Remove uma linha; se ela abria parte ou slide, a seguinte herda a parte e o tempo. */
export function removeRow(rows: WorshipRow[], id: string): WorshipRow[] {
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return rows;
  const out = rows.map((r) => ({ ...r }));
  const removed = out[index];
  const next = out[index + 1];
  if (next && !isBreak(next) && !next.part) {
    if (removed.part) next.part = removed.part;
    if (typeof removed.time === "number" && typeof next.time !== "number") {
      next.time = removed.time;
      next.timeSource = removed.timeSource;
    }
  }
  out.splice(index, 1);
  return out;
}

/** Duplica o trecho [from, to] logo depois do slide em que ele termina. As cópias não têm tempo. */
export function repeatRange(rows: WorshipRow[], from: number, to: number): WorshipRow[] {
  while (from <= to && isBreak(rows[from])) from += 1;
  while (to >= from && isBreak(rows[to])) to -= 1;
  if (from > to || !rows[from]) return rows;

  const copies: WorshipRow[] = rows.slice(from, to + 1).map((r) => {
    const copy: WorshipRow = { id: newRowId(), type: r.type };
    if (r.type !== "break") copy.text = r.text ?? "";
    if (r.type === "cue") copy.target = r.target;
    if (r.part) copy.part = { ...r.part };
    return copy;
  });

  let end = to + 1; // fim do slide onde o trecho termina
  while (end < rows.length && !isBreak(rows[end]) && !rows[end].part) end += 1;

  const out = rows.map((r) => ({ ...r }));
  const insert: WorshipRow[] = copies[0].part ? copies : [{ id: newRowId(), type: "break" }, ...copies];
  const after = out[end];
  if (after && !isBreak(after) && !after.part) {
    // O que vinha depois continua sendo da parte de antes, não da cópia.
    if (copies.some((c) => c.part)) after.part = partAt(rows, end);
    else insert.push({ id: newRowId(), type: "break" });
  }
  out.splice(end, 0, ...insert);
  return out;
}

/** O slide passa a começar na linha `index` (põe uma linha em branco antes dela). */
export function splitSlideAt(rows: WorshipRow[], index: number): WorshipRow[] {
  if (index <= 0 || index >= rows.length) return rows;
  if (isBreak(rows[index]) || rows[index].type === "cue") return rows;
  // A instrução acima da linha vai junto com ela para o slide novo.
  index = withLeadingCues(rows, index);
  if (startsSlide(rows, index)) return rows;
  const out = rows.map((r) => ({ ...r }));
  out.splice(index, 0, { id: newRowId(), type: "break" });
  return out;
}

/**
 * Cria uma parte sem letra (Intro, Instrumental, Final): uma instrução para
 * todos com o nome da parte. Intro vai para o começo, Final para o fim, e as
 * outras para depois da parte onde está o cursor.
 */
export function insertEmptyPart(rows: WorshipRow[], cursorIndex: number, kind: PartKind): WorshipRow[] {
  let at = rows.length;
  if (kind === "INTRO") at = 0;
  else if (kind !== "ENDING" && cursorIndex >= 0) {
    at = Math.min(cursorIndex + 1, rows.length);
    while (at < rows.length && !rows[at].part) at += 1;
  }
  const out = rows.map((r) => ({ ...r }));
  const row: WorshipRow = {
    id: newRowId(),
    type: "cue",
    target: "ALL",
    text: PART_KIND_LABEL[kind],
    part: { kind, mood: defaultMood(kind) },
  };
  const following = out[at];
  if (following && !isBreak(following) && !following.part) following.part = partAt(rows, at);
  out.splice(at, 0, row);
  return out;
}

export function setPartMood(rows: WorshipRow[], partRowId: string, mood: Mood): WorshipRow[] {
  const kinds = new Map(deriveSong(rows).parts.map((p) => [p.rowId, p.kind]));
  const kind = kinds.get(partRowId);
  if (!kind) return rows;
  return rows.map((r) => (r.id === partRowId ? { ...r, part: { kind, mood } } : r));
}

/** Reaplica a sugestão automática de clima em todas as partes. */
export function applySuggestedMoods(rows: WorshipRow[]): WorshipRow[] {
  const { parts } = deriveSong(rows);
  const moods = suggestMoods(parts.map((p) => p.kind));
  const byRow = new Map(parts.map((p, i) => [p.rowId, { kind: p.kind, mood: moods[i] }]));
  return rows.map((r) => (byRow.has(r.id) ? { ...r, part: byRow.get(r.id) } : r));
}

/** O que o editor lê do DOM depois de uma edição: uma entrada por linha da tela. */
export interface EditorNode {
  id: string | null;
  kind: "text" | "cue";
  text: string;
}

/**
 * Converte o que está na tela de volta em documento, preservando pelo id o que
 * o texto não carrega (parte, tempo, destinatário). Nunca descarta nem junta
 * entradas: a saída tem exatamente uma linha por entrada, na mesma ordem.
 */
export function rowsFromEditorNodes(nodes: EditorNode[], previous: WorshipRow[]): WorshipRow[] {
  const byId = new Map(previous.map((r) => [r.id, r]));
  const used = new Set<string>();
  return nodes.map((node) => {
    const known = node.id && !used.has(node.id) ? byId.get(node.id) : undefined;
    const id = known ? known.id : newRowId();
    used.add(id);

    if (node.kind === "cue") {
      const source = known ?? (node.id ? byId.get(node.id) : undefined);
      const cue: WorshipRow = { id, type: "cue", target: source?.target ?? "ALL", text: source?.text ?? node.text.trim() };
      if (known?.part) cue.part = known.part;
      if (typeof known?.time === "number") {
        cue.time = known.time;
        cue.timeSource = known.timeSource;
      }
      return cue;
    }

    const text = node.text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) {
      const blank: WorshipRow = { id, type: "break" };
      if (known?.part) blank.part = known.part; // a parte passa para a linha seguinte
      return blank;
    }
    const row: WorshipRow = { id, type: "lyric", text };
    if (known?.part) row.part = known.part;
    if (typeof known?.time === "number") {
      row.time = known.time;
      row.timeSource = known.timeSource;
    }
    return row;
  });
}

/** Cola texto puro com várias linhas na posição do cursor. Devolve o documento e a linha onde o cursor fica. */
export function pasteLines(
  rows: WorshipRow[],
  index: number,
  offset: number,
  pasted: string,
): { rows: WorshipRow[]; caretIndex: number; caretOffset: number } {
  const lines = pasted.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  const out = rows.map((r) => ({ ...r }));
  const target = out[index];
  const base = target && target.type === "lyric" ? (target.text ?? "") : "";
  const before = base.slice(0, offset);
  const after = base.slice(offset);
  const texts = lines.map((line, i) => (i === 0 ? before + line : line));
  const lastOffset = texts[texts.length - 1].length;
  texts[texts.length - 1] += after;

  const made: WorshipRow[] = texts.map((text, i) => {
    const keep = i === 0 && target && target.type !== "cue" ? target : undefined;
    const row: WorshipRow = text.trim()
      ? { id: keep?.id ?? newRowId(), type: "lyric", text }
      : { id: keep?.id ?? newRowId(), type: "break" };
    if (keep?.part) row.part = keep.part;
    if (keep && typeof keep.time === "number" && row.type === "lyric") {
      row.time = keep.time;
      row.timeSource = keep.timeSource;
    }
    return row;
  });

  if (!target) out.push(...made);
  else if (target.type === "cue") out.splice(index + 1, 0, ...made);
  else out.splice(index, 1, ...made);
  const first = !target ? rows.length : target.type === "cue" ? index + 1 : index;
  return { rows: out, caretIndex: first + made.length - 1, caretOffset: lastOffset };
}
