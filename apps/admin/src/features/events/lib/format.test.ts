import { describe, expect, it } from "vitest";
import { formatEventDate, formatTimeRange } from "./format";

describe("formatEventDate", () => {
  it("mostra o dia gravado, sem recuar um dia pelo fuso do navegador", () => {
    const expected = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
      dateStyle: "long",
    }).format(new Date(Date.UTC(2026, 9, 25)));

    const result = formatEventDate("2026-10-25");

    expect(result).toBe(expected);
    expect(result).toContain("25");
    expect(result).toContain("outubro");
  });

  it("devolve o texto original quando a data é inválida", () => {
    expect(formatEventDate("sem-data")).toBe("sem-data");
  });
});

describe("formatTimeRange", () => {
  it("início e fim viram intervalo", () => {
    expect(formatTimeRange("13:00:00", "17:00:00")).toBe("13:00 – 17:00");
  });

  it("só o início mostra o início", () => {
    expect(formatTimeRange("19:30:00", null)).toBe("19:30");
  });

  it("só o fim mostra 'até' o fim", () => {
    expect(formatTimeRange(null, "21:00")).toBe("até 21:00");
  });

  it("sem horário devolve texto vazio", () => {
    expect(formatTimeRange(null, null)).toBe("");
  });
});
