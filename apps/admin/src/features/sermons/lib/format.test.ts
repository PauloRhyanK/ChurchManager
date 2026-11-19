import { describe, expect, it } from "vitest";
import { formatBase, formatServiceLine, formatServiceSentence, formatSituation, formatSpeech } from "./format";
import type { SermonSummary } from "../api/sermons-api";

const sermon = (over: Partial<SermonSummary>): SermonSummary => ({
  id: "p1",
  title: "A luz do mundo",
  baseReference: "João 8:12",
  pointCount: 3,
  estimatedSeconds: 1680,
  status: "DRAFT",
  delivery: null,
  slideCount: 0,
  updatedAt: "2026-11-19T00:00:00.000Z",
  ...over,
});

describe("formatBase", () => {
  it("junta versículo e pontos", () => {
    expect(formatBase(sermon({}))).toBe("João 8:12 · 3 pontos");
    expect(formatBase(sermon({ pointCount: 1 }))).toBe("João 8:12 · 1 ponto");
    expect(formatBase(sermon({ pointCount: 0 }))).toBe("João 8:12 · sem pontos ainda");
  });
  it("sem versículo mostra só os pontos", () => {
    expect(formatBase(sermon({ baseReference: null }))).toBe("3 pontos");
    expect(formatBase(sermon({ baseReference: null, pointCount: 0 }))).toBe("sem pontos ainda");
  });
});

describe("formatSituation", () => {
  it("rascunho", () => {
    expect(formatSituation(sermon({}))).toBe("Rascunho");
  });
  it("enviada com dia da semana, data e hora", () => {
    const delivery = { date: "2026-11-22", startTime: "19:00", serviceId: null, serviceName: null };
    expect(formatSituation(sermon({ status: "SENT", delivery }))).toBe("Enviada · dom 22/11, 19h");
    expect(formatSituation(sermon({ status: "SENT", delivery: { ...delivery, startTime: "19:30" } }))).toBe(
      "Enviada · dom 22/11, 19h30",
    );
  });
  it("pregada só com dia e data", () => {
    const delivery = { date: "2026-11-15", startTime: "09:00", serviceId: null, serviceName: null };
    expect(formatSituation(sermon({ status: "PREACHED", delivery }))).toBe("Pregada · dom 15/11");
  });
  it("abrevia os dias da semana em pt-BR", () => {
    const at = (date: string) =>
      formatSituation(sermon({ status: "PREACHED", delivery: { date, startTime: "09:00", serviceId: null, serviceName: null } }));
    expect(at("2026-11-16")).toBe("Pregada · seg 16/11");
    expect(at("2026-11-21")).toBe("Pregada · sáb 21/11");
  });
});

describe("formatSpeech", () => {
  it("em minutos", () => {
    expect(formatSpeech(1680)).toBe("28 min de fala");
    expect(formatSpeech(59)).toBe("menos de 1 min de fala");
  });
});

describe("formatServiceLine", () => {
  it("dia da semana por extenso, capitalizado", () => {
    expect(formatServiceLine("2026-11-22", "19:00")).toBe("Domingo, 22/11 · 19h");
    expect(formatServiceLine("2026-11-23", "09:30")).toBe("Segunda, 23/11 · 9h30");
    expect(formatServiceLine("2026-11-24", "19:00")).toBe("Terça, 24/11 · 19h");
    expect(formatServiceLine("2026-11-25", "19:00")).toBe("Quarta, 25/11 · 19h");
    expect(formatServiceLine("2026-11-26", "19:00")).toBe("Quinta, 26/11 · 19h");
    expect(formatServiceLine("2026-11-27", "19:00")).toBe("Sexta, 27/11 · 19h");
    expect(formatServiceLine("2026-11-28", "19:00")).toBe("Sábado, 28/11 · 19h");
  });
  it("variante minúscula para frases", () => {
    expect(formatServiceSentence("2026-12-06", "19:00")).toBe("domingo, 06/12 · 19h");
  });
});
