import { describe, expect, it } from "vitest";
import { type WorshipRow, deriveSong, holyricsText, songStatus } from "./document";
import { formatClock, formatClockTenths, formatServiceLabel, plain, songFicha } from "./format";
import { situationOf } from "./labels";
import {
  applyTimes,
  changedCount,
  currentSlideIndex,
  markSlide,
  moveSlideStart,
  nudgeSlide,
  projectedSlideIndex,
  shiftBySeconds,
  shiftBySlides,
  slideStates,
} from "./timing";

const rows = (): WorshipRow[] => [
  { id: "a", type: "lyric", text: "um", part: { kind: "VERSE", mood: "WORSHIP" } },
  { id: "b", type: "break" },
  { id: "c", type: "lyric", text: "dois" },
  { id: "d", type: "break" },
  { id: "e", type: "lyric", text: "três" },
];

describe("tempo dos slides", () => {
  it("marcar grava o tempo arredondado e a origem manual", () => {
    const out = markSlide(rows(), "c", 12.3456);
    expect(out[2]).toMatchObject({ time: 12.35, timeSource: "MANUAL" });
    expect(markSlide(rows(), "c", -3)[2].time).toBe(0);
  });

  it("ajuste de 0,1 s só mexe em slide que já tem tempo", () => {
    const marked = markSlide(rows(), "c", 12.3);
    expect(nudgeSlide(marked, "c", -0.1)[2].time).toBe(12.2);
    expect(nudgeSlide(marked, "a", 0.1)[0].time).toBeUndefined();
    expect(nudgeSlide(markSlide(rows(), "a", 0.05), "a", -0.1)[0].time).toBe(0);
  });

  it("estados: sem tempo, certo, conferir (fora de ordem ou além do áudio) e IA", () => {
    let r = markSlide(rows(), "a", 10);
    r = markSlide(r, "c", 5);
    expect(slideStates(deriveSong(r).slides, 60)).toEqual(["OK", "CHECK", "NONE"]);
    r = markSlide(markSlide(r, "c", 20), "e", 61);
    expect(slideStates(deriveSong(r).slides, 60)).toEqual(["OK", "OK", "CHECK"]);
    r = r.map((x) => (x.id === "c" ? { ...x, timeSource: "AI" as const } : x));
    expect(slideStates(deriveSong(r).slides, null)).toEqual(["OK", "AI", "OK"]);
  });

  it("slide no ar: o último cujo tempo já passou, pulando os sem tempo", () => {
    const r = markSlide(markSlide(rows(), "a", 10), "e", 30);
    const { slides } = deriveSong(r);
    expect(currentSlideIndex(slides, 5)).toBe(-1);
    expect(currentSlideIndex(slides, 10)).toBe(0);
    expect(currentSlideIndex(slides, 29.9)).toBe(0);
    expect(currentSlideIndex(slides, 31)).toBe(2);
  });
});

describe("textos", () => {
  it("relógio, ficha, busca e data do culto", () => {
    expect(formatClock(252.4)).toBe("4:12");
    expect(formatClock(null)).toBe("–:––");
    expect(formatClockTenths(131.25)).toBe("2:11,3");
    expect(songFicha({ musicalKey: "Sol", bpm: 72, audio: { durationSeconds: 252 } })).toBe("Sol · 72 bpm · 4:12");
    expect(songFicha({ musicalKey: null, bpm: null, audio: null })).toBe("Só a letra");
    expect(plain("  Luz da MANHÃ ")).toBe("luz da manha");
    expect(formatServiceLabel("2026-11-22", "19:00")).toBe("Domingo, 22/11 · 19h");
    expect(formatServiceLabel("2026-11-25", "19:30")).toBe("Quarta, 25/11 · 19h30");
  });

  it("situação: Pronta, Rascunho, Falta o tempo e Falta conferir", () => {
    expect(situationOf("READY", []).label).toBe("Pronta");
    expect(situationOf("DRAFT", []).label).toBe("Rascunho");
    expect(situationOf("NEEDS_TIMING", ["AUDIO", "TIMES"]).label).toBe("Falta o tempo");
    expect(situationOf("NEEDS_TIMING", ["CONFIRM"]).label).toBe("Falta conferir");
  });

  it("a cópia do documento no painel segue as mesmas regras da API", () => {
    const r = markSlide(markSlide(markSlide(rows(), "a", 1), "c", 2), "e", 3);
    expect(songStatus(r, { url: "x", durationSeconds: 10 }, null)).toEqual({ status: "NEEDS_TIMING", pending: ["CONFIRM"], slideCount: 3 });
    expect(holyricsText(r)).toBe("UM\n\nDOIS\n\nTRÊS");
  });
});

describe("ajustes em massa e bordas", () => {
  it("voltar um slide conserta quem marcou no fim da frase", () => {
    // Marcado no fim: o toque do slide 0 caiu quando o slide 1 começou, e assim por diante.
    const late = [10, 20, 30, 40];
    expect(shiftBySlides(late, -1, 60)).toEqual([0, 10, 20, 30]);
    expect(shiftBySlides([12, 20, 30], -1, 60)).toEqual([4, 12, 20]);
    expect(shiftBySlides([10, 20, 30], 1, 60)).toEqual([20, 30, 40]);
    expect(shiftBySlides([10, 20, 55], 1, 60)).toEqual([20, 55, 60]);
    // Ida e volta preserva o miolo.
    expect(shiftBySlides(shiftBySlides([5, 10, 20, 30], -1, 60), 1, 60).slice(0, 3)).toEqual([5, 10, 20]);
  });

  it("mover tudo em segundos fica dentro do áudio e mantém os sem tempo", () => {
    expect(shiftBySeconds([0.2, null, 10], -0.5, 60)).toEqual([0, null, 9.5]);
    expect(shiftBySeconds([59.8], 0.5, 60)).toEqual([60]);
  });

  it("borda arrastada não passa dos vizinhos", () => {
    expect(moveSlideStart([10, 20, 30], 1, 25, 60)).toEqual([10, 25, 30]);
    expect(moveSlideStart([10, 20, 30], 1, 5, 60)).toEqual([10, 10.1, 30]);
    expect(moveSlideStart([10, 20, 30], 1, 99, 60)).toEqual([10, 29.9, 30]);
    expect(moveSlideStart([10, null, 30], 0, 50, 60)).toEqual([29.9, null, 30]);
    expect(moveSlideStart([10, null, 30], 1, 15, 60)).toEqual([10, null, 30]);
  });

  it("aplica os tempos nas linhas e a projeção já adianta", () => {
    const doc = rows();
    const { slides } = deriveSong(doc);
    const next = applyTimes(doc, slides, [1, 2, null]);
    const again = deriveSong(next).slides;
    expect(again.map((s) => s.time)).toEqual([1, 2, null]);
    expect(projectedSlideIndex(again, 1.75, 0.3)).toBe(1);
    expect(projectedSlideIndex(again, 1.6, 0.3)).toBe(0);
    expect(changedCount([1, 2, 3], [1, 2.5, 3])).toBe(1);
  });
});
