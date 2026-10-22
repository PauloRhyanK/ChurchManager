import { describe, expect, it } from "vitest";
import { formatEventDate } from "./format";

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
