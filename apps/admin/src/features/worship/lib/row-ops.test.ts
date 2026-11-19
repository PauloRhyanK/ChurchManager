import { describe, expect, it } from "vitest";
import { type WorshipRow, deriveSong, normalizeRows } from "./document";
import {
  applySuggestedMoods,
  insertCue,
  insertEmptyPart,
  pasteLines,
  removeRow,
  repeatRange,
  rowsFromEditorNodes,
  setPartKind,
  setPartMood,
  splitSlideAt,
} from "./row-ops";

const verse = (): WorshipRow[] => [
  { id: "a", type: "lyric", text: "Antes do sol nascer", part: { kind: "VERSE", mood: "WORSHIP" }, time: 10 },
  { id: "b", type: "lyric", text: "Tua voz me chamou" },
  { id: "c", type: "break" },
  { id: "d", type: "lyric", text: "És a luz da manhã", time: 20 },
  { id: "e", type: "lyric", text: "Que não vai se apagar" },
  { id: "f", type: "break" },
  { id: "g", type: "lyric", text: "Quando a noite pesar", time: 30 },
];
const names = (rows: WorshipRow[]) => deriveSong(rows).parts.map((p) => p.name);
const texts = (rows: WorshipRow[]) => deriveSong(rows).slides.map((s) => s.lines.join(" / "));

describe("setPartKind", () => {
  it("marcar o meio de um verso como Refrão gera três partes; a última mantém tipo e clima", () => {
    const out = setPartKind(verse(), 3, 4, "CHORUS");
    expect(names(out)).toEqual(["Verso 1", "Refrão", "Verso 2"]);
    expect(deriveSong(out).parts.map((p) => p.mood)).toEqual(["WORSHIP", "CELEBRATION", "WORSHIP"]);
    expect(out[6].part).toEqual({ kind: "VERSE", mood: "WORSHIP" });
  });

  it("seleção que atravessa partes junta tudo numa só", () => {
    const three = setPartKind(verse(), 3, 4, "CHORUS");
    expect(names(setPartKind(three, 0, 6, "BRIDGE"))).toEqual(["Ponte"]);
  });

  it("mesmo tipo de novo não troca o clima escolhido; seleção só de linha em branco não faz nada", () => {
    const rows = verse();
    rows[0].part = { kind: "VERSE", mood: "EXPLOSION" };
    expect(setPartKind(rows, 0, 1, "VERSE")[0].part).toEqual({ kind: "VERSE", mood: "EXPLOSION" });
    expect(setPartKind(rows, 2, 2, "CHORUS")).toBe(rows);
  });
});

describe("insertCue / removeRow", () => {
  it("instrução antes do começo de um slide herda a parte e o tempo", () => {
    const out = insertCue(verse(), 0, "VOCAL", " solo ");
    expect(out[0]).toMatchObject({ type: "cue", target: "VOCAL", text: "solo", time: 10, part: { kind: "VERSE" } });
    expect(out[1].part).toBeUndefined();
    expect(out[1].time).toBeUndefined();
    expect(deriveSong(out).slides[0]).toMatchObject({ time: 10, cues: [{ target: "VOCAL", text: "solo" }] });
  });

  it("instrução no meio de um slide não mexe em tempo nem parte", () => {
    const out = insertCue(verse(), 1, "DRUMS", "entra");
    expect(out[0].time).toBe(10);
    expect(deriveSong(out).slides).toHaveLength(3);
  });

  it("remover a instrução devolve a parte e o tempo para a linha seguinte", () => {
    const withCue = insertCue(verse(), 0, "VOCAL", "solo");
    const out = removeRow(withCue, withCue[0].id);
    expect(out[0]).toMatchObject({ id: "a", time: 10, part: { kind: "VERSE", mood: "WORSHIP" } });
  });
});

describe("repeatRange / splitSlideAt / insertEmptyPart", () => {
  it("repete um slide logo abaixo, com ids novos e sem tempo", () => {
    const out = repeatRange(verse(), 3, 4);
    expect(texts(out)).toEqual([
      "ANTES DO SOL NASCER / TUA VOZ ME CHAMOU",
      "ÉS A LUZ DA MANHÃ / QUE NÃO VAI SE APAGAR",
      "ÉS A LUZ DA MANHÃ / QUE NÃO VAI SE APAGAR",
      "QUANDO A NOITE PESAR",
    ]);
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
    expect(deriveSong(out).slides.map((s) => s.time)).toEqual([10, 20, null, 30]);
  });

  it("repetir só a primeira linha de um slide não parte o slide ao meio", () => {
    const out = repeatRange(verse(), 3, 3);
    expect(texts(out)).toEqual([
      "ANTES DO SOL NASCER / TUA VOZ ME CHAMOU",
      "ÉS A LUZ DA MANHÃ / QUE NÃO VAI SE APAGAR",
      "ÉS A LUZ DA MANHÃ",
      "QUANDO A NOITE PESAR",
    ]);
  });

  it("repetir uma parte inteira cria outra parte igual, e o resto continua sendo o que era", () => {
    const three = setPartKind(verse(), 3, 4, "CHORUS");
    expect(names(repeatRange(three, 3, 4))).toEqual(["Verso 1", "Refrão", "Refrão", "Verso 2"]);
  });

  it("dividir slide põe uma quebra antes da linha; no começo de slide não faz nada", () => {
    expect(texts(splitSlideAt(verse(), 1))).toHaveLength(4);
    const rows = verse();
    expect(splitSlideAt(rows, 0)).toBe(rows);
    expect(splitSlideAt(rows, 3)).toBe(rows);
    expect(splitSlideAt(rows, 2)).toBe(rows);
  });

  it("a instrução acima de uma linha vai junto com ela: dividir e marcar parte não a separam", () => {
    const first = insertCue(verse(), 0, "VOCAL", "solo");
    expect(splitSlideAt(first, 1)).toBe(first);
    const middle = insertCue(verse(), 4, "DRUMS", "entra");
    expect(texts(splitSlideAt(middle, 5))).toEqual([
      "ANTES DO SOL NASCER / TUA VOZ ME CHAMOU",
      "ÉS A LUZ DA MANHÃ",
      "QUE NÃO VAI SE APAGAR",
      "QUANDO A NOITE PESAR",
    ]);
    expect(deriveSong(splitSlideAt(middle, 5)).slides[2].cues).toEqual([{ target: "DRUMS", text: "entra" }]);
    const cueFirst = insertCue(verse(), 3, "KEYS", "pad");
    const chorus = setPartKind(cueFirst, 4, 5, "CHORUS");
    expect(names(chorus)).toEqual(["Verso 1", "Refrão", "Verso 2"]);
    expect(deriveSong(chorus).slides[1].cues).toEqual([{ target: "KEYS", text: "pad" }]);
    expect(deriveSong(chorus).slides[1].time).toBe(20);
  });

  it("parte sem letra: Intro no começo, Final no fim, Instrumental depois da parte do cursor", () => {
    expect(names(insertEmptyPart(verse(), 4, "INTRO"))).toEqual(["Intro", "Verso 1"]);
    expect(names(insertEmptyPart(verse(), 0, "ENDING"))).toEqual(["Verso 1", "Final"]);
    const three = setPartKind(verse(), 3, 4, "CHORUS");
    expect(names(insertEmptyPart(three, 0, "INSTRUMENTAL"))).toEqual(["Verso 1", "Instrumental", "Refrão", "Verso 2"]);
    expect(deriveSong(insertEmptyPart(verse(), 0, "INTRO")).slides[0].lines).toEqual([]);
  });
});

describe("climas", () => {
  it("troca o clima de uma parte e reaplica a sugestão", () => {
    const changed = setPartMood(verse(), "a", "EXPLOSION");
    expect(changed[0].part).toEqual({ kind: "VERSE", mood: "EXPLOSION" });
    expect(applySuggestedMoods(changed)[0].part).toEqual({ kind: "VERSE", mood: "WORSHIP" });
    const rows = verse();
    expect(setPartMood(rows, "nao-existe", "BUILD")).toBe(rows);
  });
});

describe("rowsFromEditorNodes", () => {
  const previous = verse();
  const node = (id: string | null, text: string) => ({ id, kind: "text" as const, text });

  it("preserva parte e tempo pelo id e lê o texto novo", () => {
    const out = rowsFromEditorNodes([node("a", "Antes do sol raiar "), node("b", "Tua voz")], previous);
    expect(out[0]).toEqual({ id: "a", type: "lyric", text: "Antes do sol raiar", part: { kind: "VERSE", mood: "WORSHIP" }, time: 10, timeSource: undefined });
    expect(out[1]).toEqual({ id: "b", type: "lyric", text: "Tua voz" });
  });

  it("Enter clona o id no navegador: a segunda linha ganha id novo e não herda tempo", () => {
    const out = rowsFromEditorNodes([node("a", "Antes"), node("a", "do sol nascer"), node(null, "linha nova")], previous);
    expect(out).toHaveLength(3);
    expect(out[1].id).not.toBe("a");
    expect(out[1].time).toBeUndefined();
    expect(out[1].part).toBeUndefined();
    expect(new Set(out.map((r) => r.id)).size).toBe(3);
  });

  it("apagar a instrução que abria a parte (Backspace) passa parte e tempo para a letra", () => {
    const withCue = insertCue(previous, 0, "VOCAL", "solo");
    const out = rowsFromEditorNodes([node("a", "Antes do sol nascer"), node("b", "Tua voz me chamou")], withCue);
    expect(out[0]).toMatchObject({ id: "a", part: { kind: "VERSE", mood: "WORSHIP" }, time: 10 });
  });

  it("Enter no começo da primeira linha de um slide: o texto leva a parte e o tempo", () => {
    const out = rowsFromEditorNodes([node("a", ""), node("a", "Antes do sol nascer"), node("b", "Tua voz")], previous);
    expect(out[0]).toEqual({ id: "a", type: "break" });
    expect(out[1]).toMatchObject({ type: "lyric", text: "Antes do sol nascer", part: { kind: "VERSE", mood: "WORSHIP" }, time: 10 });
    expect(deriveSong(out).slides[0].time).toBe(10);
  });

  it("apagar o texto de uma linha e redigitar não perde o tempo dela", () => {
    const emptied = rowsFromEditorNodes([node("a", "Antes"), node("b", "x"), node("c", ""), node("d", "")], previous);
    expect(emptied[3]).toMatchObject({ id: "d", type: "break", time: 20 });
    const retyped = rowsFromEditorNodes([node("a", "Antes"), node("b", "x"), node("c", ""), node("d", "És a luz")], emptied);
    expect(retyped[3]).toMatchObject({ id: "d", type: "lyric", time: 20 });
    expect(normalizeRows([...emptied, { id: "z", type: "lyric", text: "depois" }]).at(-1)).toMatchObject({ id: "z", time: 20 });
  });

  it("linha esvaziada vira quebra; se abria parte, a parte passa adiante", () => {
    const out = rowsFromEditorNodes([node("a", "  "), node("b", "Tua voz me chamou")], previous);
    expect(out[0]).toEqual({ id: "a", type: "break", part: { kind: "VERSE", mood: "WORSHIP" }, time: 10, timeSource: undefined });
    expect(deriveSong(out).parts).toHaveLength(1);
    expect(normalizeRows(out)[0]).toMatchObject({ id: "b", part: { kind: "VERSE", mood: "WORSHIP" } });
  });

  it("instrução mantém destinatário e texto do documento, não o que está na tela", () => {
    const withCue = insertCue(previous, 0, "DRUMS", "entra cheia");
    const out = rowsFromEditorNodes([{ id: withCue[0].id, kind: "cue", text: "Bateria entra cheia" }, node("a", "Antes")], withCue);
    expect(out[0]).toMatchObject({ type: "cue", target: "DRUMS", text: "entra cheia", time: 10 });
  });

  it("tudo apagado devolve documento vazio; uma entrada por nó, sempre", () => {
    expect(rowsFromEditorNodes([], previous)).toEqual([]);
    const nodes = [node(null, ""), node("zzz", "x"), node("a", "y"), node("a", ""), node("a", "z")];
    expect(rowsFromEditorNodes(nodes, previous)).toHaveLength(nodes.length);
  });
});

describe("pasteLines", () => {
  it("cola várias linhas no meio de uma linha, mantendo o que vinha antes e depois", () => {
    const { rows, caretIndex, caretOffset } = pasteLines(verse(), 1, 3, " nova\r\nsegunda\n\nterceira");
    expect(rows.slice(1, 5).map((r) => [r.type, r.text])).toEqual([
      ["lyric", "Tuanova"],
      ["lyric", "segunda"],
      ["break", undefined],
      ["lyric", "terceira voz me chamou"],
    ]);
    expect(rows[1].id).toBe("b");
    expect(caretIndex).toBe(4);
    expect(caretOffset).toBe("terceira".length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("cola em documento vazio", () => {
    const { rows } = pasteLines([], 0, 0, "um\ndois");
    expect(rows.map((r) => r.text)).toEqual(["um", "dois"]);
  });
});
