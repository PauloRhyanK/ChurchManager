import {
  type CueTarget,
  type Mood,
  type PartKind,
  type RowPart,
  type WorshipRow,
  MAX_PART_NAME,
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
  // Mesmo tipo: fica como estava (com o nome próprio, se houver).
  out[from].part = current?.kind === kind ? { ...current } : { kind, mood: defaultMood(kind) };
  for (let i = from + 1; i <= to; i++) delete out[i].part;

  let next = to + 1;
  while (next < out.length && isBreak(out[next])) next += 1;
  if (next < out.length && !out[next].part) out[next].part = partAt(rows, next);
  return out;
}

/** Insere uma instrução antes da linha `beforeIndex`; ela passa a abrir o slide daquela linha. */
export function insertCue(rows: WorshipRow[], beforeIndex: number, target: CueTarget, text: string): WorshipRow[] {
  return placeCue(rows, beforeIndex, { id: newRowId(), type: "cue", target, text: text.trim() });
}

function placeCue(rows: WorshipRow[], beforeIndex: number, cue: WorshipRow): WorshipRow[] {
  const index = Math.max(0, Math.min(beforeIndex, rows.length));
  const out = rows.map((r) => ({ ...r }));
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

/** Tira linhas em branco repetidas ou nas pontas (as que não guardam parte nem tempo). */
function tidyBreaks(rows: WorshipRow[]): WorshipRow[] {
  const plain = (r: WorshipRow | undefined) => !!r && r.type === "break" && !r.part && typeof r.time !== "number";
  const out = rows.filter((r, i) => !(plain(r) && (i === 0 || isBreak(rows[i - 1]) || !!rows[i + 1]?.part)));
  while (plain(out[out.length - 1])) out.pop();
  return out;
}

/**
 * Leva a instrução `id` para antes da linha `beforeIndex` (posição contada no
 * documento de antes da mudança; `rows.length` é o fim). Ela sai deixando a
 * parte e o tempo para quem vinha depois e, no lugar novo, vale o mesmo que
 * uma instrução inserida ali. Instrução que é sozinha uma parte (Intro,
 * Instrumental, Final) leva a parte junto.
 */
export function moveCue(rows: WorshipRow[], id: string, beforeIndex: number, destination?: "part-end"): WorshipRow[] {
  const from = rows.findIndex((r) => r.id === id && r.type === "cue");
  if (from < 0 || beforeIndex === from || beforeIndex === from + 1) return rows;
  const cue = rows[from];
  let after = from + 1;
  while (after < rows.length && isBreak(rows[after])) after += 1;
  const standalone = !!cue.part && (after >= rows.length || !!rows[after].part);
  const at = Math.max(0, Math.min(beforeIndex > from ? beforeIndex - 1 : beforeIndex, rows.length - 1));
  const moved: WorshipRow = { id: cue.id, type: "cue", target: cue.target ?? "ALL", text: cue.text ?? "" };

  if (standalone) {
    const out = rows.filter((r) => r.id !== id).map((r) => ({ ...r }));
    moved.part = { ...cue.part! };
    const following = out[at];
    // O que vem depois continua na parte em que estava.
    if (following && !isBreak(following) && !following.part) following.part = partAt(out, at);
    out.splice(at, 0, moved);
    return tidyBreaks(out);
  }
  if (destination === "part-end") {
    const out = removeRow(rows, id);
    out.splice(at, 0, moved);
    return tidyBreaks(out);
  }
  return tidyBreaks(placeCue(removeRow(rows, id), at, moved));
}

/**
 * Dá à parte que começa na linha `rowId` o tipo `kind` e, se vier, um nome
 * próprio (`null` volta ao nome do tipo, como "Verso 2").
 */
export function renamePart(rows: WorshipRow[], rowId: string, kind: PartKind, name: string | null): WorshipRow[] {
  const index = rows.findIndex((r) => r.id === rowId);
  if (index < 0) return rows;
  const out = rows.map((r) => ({ ...r }));
  // A parte pode estar guardada numa linha esvaziada logo acima: passa para cá.
  let carried: RowPart | undefined;
  for (let i = index - 1; i >= 0 && isBreak(out[i]); i--) {
    if (out[i].part) {
      carried = carried ?? out[i].part;
      delete out[i].part;
    }
  }
  const current = out[index].part ?? carried ?? partAt(rows, index);
  const part: RowPart = { kind, mood: current.kind === kind ? current.mood : defaultMood(kind) };
  const clean = (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PART_NAME);
  if (clean) part.name = clean;
  out[index].part = part;
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

/** Divide uma parte no início da linha/seleção e herda o clima da parte original. */
export function splitPartAt(rows: WorshipRow[], index: number, kind: PartKind, name: string | null = null): WorshipRow[] {
  if (index <= 0 || index >= rows.length || isBreak(rows[index])) return rows;
  index = withLeadingCues(rows, index);
  if (rows[index]?.part) return rows;
  const current = partAt(rows, index);
  const part: RowPart = { kind, mood: current.mood };
  const cleanName = (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PART_NAME);
  if (cleanName) part.name = cleanName;
  const out = rows.map((r) => ({ ...r }));
  out[index].part = part;
  return out;
}

function partMarkers(rows: WorshipRow[], index: number): number[] {
  const markers = [index];
  for (let i = index - 1; i >= 0 && isBreak(rows[i]); i--) if (rows[i].part) markers.push(i);
  return markers;
}

/** Une a parte selecionada ao vizinho; a parte de destino conserva seu clima. */
export function mergePart(rows: WorshipRow[], partRowId: string, direction: "previous" | "next"): WorshipRow[] {
  const parts = deriveSong(rows).parts;
  const index = parts.findIndex((part) => part.rowId === partRowId);
  if (index < 0) return rows;
  const removeIndex = direction === "previous" ? index : index + 1;
  if (removeIndex <= 0 || removeIndex >= parts.length) return rows;
  const boundary = rows.findIndex((row) => row.id === parts[removeIndex].rowId);
  if (boundary < 0) return rows;
  const out = rows.map((row) => ({ ...row }));
  for (const marker of partMarkers(rows, boundary)) delete out[marker].part;
  return out;
}

/** Move uma parte inteira mantendo cada linha e seus dados ligados ao mesmo ID. */
export function movePart(rows: WorshipRow[], partRowId: string, direction: -1 | 1): WorshipRow[] {
  const parts = deriveSong(rows).parts;
  const index = parts.findIndex((part) => part.rowId === partRowId);
  const neighbor = index + direction;
  if (index < 0 || neighbor < 0 || neighbor >= parts.length) return rows;
  const starts = parts.map((part) => rows.findIndex((row) => row.id === part.rowId));
  starts.forEach((start, partIndex) => {
    for (let i = start - 1; i >= 0 && isBreak(rows[i]); i--) {
      if (rows[i].part) starts[partIndex] = i;
    }
  });
  const ranges = starts.map((start, partIndex) => [start, starts[partIndex + 1] ?? rows.length] as const);
  const blocks = ranges.map(([start, end]) => rows.slice(start, end));
  [blocks[index], blocks[neighbor]] = [blocks[neighbor], blocks[index]];
  return blocks.flat().map((row) => ({ ...row }));
}

function wrapText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      if (line) chunks.push(line);
      line = "";
      for (let at = 0; at < word.length; at += maxChars) chunks.push(word.slice(at, at + maxChars));
    } else if (line && line.length + word.length + 1 > maxChars) {
      chunks.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) chunks.push(line);
  return chunks;
}

/** Reorganiza apenas as quebras de um slide; preserva texto, anotação e metadados originais. */
export function reflowSlide(rows: WorshipRow[], slideRowId: string, maxChars: number, maxLines: number): WorshipRow[] {
  if (maxChars < 1 || maxLines < 1) return rows;
  const start = rows.findIndex((row) => row.id === slideRowId);
  if (start < 0) return rows;
  let end = start + 1;
  while (end < rows.length && !isBreak(rows[end]) && !rows[end].part) end += 1;

  const original = rows.slice(start, end);
  const outputSlides: WorshipRow[][] = [[]];
  let pendingCues: WorshipRow[] = [];
  let lineCount = 0;
  for (const row of original) {
    if (row.type === "cue") {
      pendingCues.push({ ...row });
      continue;
    }
    const lines = wrapText(row.text ?? "", maxChars);
    for (const [lineIndex, text] of lines.entries()) {
      if (lineCount >= maxLines) {
        outputSlides.push([{ id: newRowId(), type: "break" }]);
        lineCount = 0;
      }
      if (pendingCues.length) {
        outputSlides[outputSlides.length - 1].push(...pendingCues);
        pendingCues = [];
      }
      const copy: WorshipRow = lineIndex === 0 ? { ...row, text } : { id: newRowId(), type: "lyric", text };
      outputSlides[outputSlides.length - 1].push(copy);
      lineCount += 1;
    }
  }
  if (pendingCues.length) outputSlides[outputSlides.length - 1].push(...pendingCues);
  return [...rows.slice(0, start), ...outputSlides.flat(), ...rows.slice(end)];
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
  return rows.map((r) => (r.id === partRowId ? { ...r, part: { ...r.part, kind, mood } } : r));
}

/** Reaplica a sugestão automática de clima em todas as partes. */
export function applySuggestedMoods(rows: WorshipRow[]): WorshipRow[] {
  const { parts } = deriveSong(rows);
  const moods = suggestMoods(parts.map((p) => p.kind));
  const byRow = new Map(parts.map((p, i) => [p.rowId, { kind: p.kind, mood: moods[i] }]));
  return rows.map((r) => (byRow.has(r.id) ? { ...r, part: { ...r.part, ...byRow.get(r.id)! } } : r));
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
  // Enter no começo de uma linha: o navegador deixa a de cima vazia e põe o texto
  // numa cópia com o mesmo id. A parte e o tempo são do texto, não da linha vazia.
  const movedDown = new Map<number, WorshipRow>();
  nodes.forEach((node, i) => {
    const above = nodes[i - 1];
    if (above && node.id && above.id === node.id && above.kind === "text" && !above.text.trim() && node.text.trim()) {
      const source = byId.get(node.id);
      if (source) movedDown.set(i, source);
    }
  });

  const out = nodes.map((node, i) => {
    const moved = movedDown.get(i);
    const gaveAway = movedDown.has(i + 1);
    const found = node.id && !used.has(node.id) ? byId.get(node.id) : undefined;
    // `known` guarda o id; `meta` é de onde vêm a parte e o tempo.
    const known = found;
    const meta = moved ?? (gaveAway ? undefined : found);
    const id = known ? known.id : newRowId();
    used.add(id);

    if (node.kind === "cue") {
      const source = known ?? (node.id ? byId.get(node.id) : undefined);
      const cue: WorshipRow = { id, type: "cue", target: source?.target ?? "ALL", text: source?.text ?? node.text.trim() };
      if (meta?.part) cue.part = meta.part;
      if (typeof meta?.time === "number") {
        cue.time = meta.time;
        cue.timeSource = meta.timeSource;
      }
      return cue;
    }

    const text = node.text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) {
      // Linha esvaziada: guarda a parte e o tempo. Se o texto voltar, voltam com
      // ele; se não, ao salvar passam para a linha seguinte.
      const blank: WorshipRow = { id, type: "break" };
      if (meta?.part) blank.part = meta.part;
      if (typeof meta?.time === "number") {
        blank.time = meta.time;
        blank.timeSource = meta.timeSource;
      }
      return blank;
    }
    const row: WorshipRow = { id, type: "lyric", text };
    if (meta?.part) row.part = meta.part;
    if (typeof meta?.time === "number") {
      row.time = meta.time;
      row.timeSource = meta.timeSource;
    }
    return row;
  });

  // Linha que sumiu da tela (instrução apagada com Backspace, linha juntada à de
  // cima): se abria parte ou slide, a linha que vinha logo depois herda, como em `removeRow`.
  const outById = new Map(out.map((r) => [r.id, r]));
  previous.forEach((gone, i) => {
    if (outById.has(gone.id) || (!gone.part && typeof gone.time !== "number")) return;
    const heir = previous[i + 1] ? outById.get(previous[i + 1].id) : undefined;
    if (!heir || heir.type === "break" || heir.part) return;
    if (gone.part) heir.part = gone.part;
    if (typeof gone.time === "number" && typeof heir.time !== "number") {
      heir.time = gone.time;
      heir.timeSource = gone.timeSource;
    }
  });
  return out;
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
