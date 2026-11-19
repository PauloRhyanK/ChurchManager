import { describe, expect, it } from "vitest";
import { type WorshipRow, deriveSong } from "./document";
import { choiceFromText, partNameOptions } from "./part-names";

const rows: WorshipRow[] = [
  { id: "a", type: "lyric", text: "um", part: { kind: "VERSE", mood: null } },
  { id: "b", type: "lyric", text: "dois", part: { kind: "CHORUS", mood: null } },
  { id: "c", type: "lyric", text: "tres", part: { kind: "VERSE", mood: null } },
  { id: "d", type: "lyric", text: "quatro", part: { kind: "CHORUS", mood: null, name: "Refrão final" } },
  { id: "e", type: "lyric", text: "cinco", part: { kind: "CHORUS", mood: null } },
];
const { parts } = deriveSong(rows);

describe("nomes de parte", () => {
  it("sugere os nomes da música, sem repetir, e os tipos que faltam", () => {
    const { existing, types } = partNameOptions(parts);
    expect(existing.map((o) => o.label)).toEqual(["Verso 1", "Refrão", "Verso 2", "Refrão final"]);
    expect(existing[1].choice).toEqual({ kind: "CHORUS", name: null });
    expect(existing[2].choice).toEqual({ kind: "VERSE", name: "Verso 2" });
    expect(existing[3].choice).toEqual({ kind: "CHORUS", name: "Refrão final" });
    expect(types.map((o) => o.label)).toEqual(["Intro", "Verso", "Pré-refrão", "Ponte", "Instrumental", "Final"]);
  });

  it("texto digitado: existente, tipo, nome novo com tipo pelo começo ou mantido", () => {
    expect(choiceFromText("refrao final", parts, "VERSE")).toEqual({ kind: "CHORUS", name: "Refrão final" });
    expect(choiceFromText(" ponte ", parts, "VERSE")).toEqual({ kind: "BRIDGE", name: null });
    expect(choiceFromText("Pré-refrão 2", parts, "VERSE")).toEqual({ kind: "PRE_CHORUS", name: "Pré-refrão 2" });
    expect(choiceFromText("Tag", parts, "CHORUS")).toEqual({ kind: "CHORUS", name: "Tag" });
    expect(choiceFromText("   ", parts, "CHORUS")).toBeNull();
  });
});
