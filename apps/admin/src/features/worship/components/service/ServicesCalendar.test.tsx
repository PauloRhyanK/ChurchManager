import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ServiceSummary } from "../../api/worship-api";
import { parseMonth, shiftMonth } from "../../lib/calendar";
import { ServicesCalendar } from "./ServicesCalendar";

const services: ServiceSummary[] = [
  { id: "s1", date: "2026-11-15", startTime: "19:00", name: "Culto da noite", songCount: 4, hasSermon: false },
  { id: "s2", date: "2026-11-15", startTime: "09:30", name: "Culto da manhã", songCount: 0, hasSermon: false },
  { id: "s3", date: "2026-12-06", startTime: "19:00", name: "Fora do mês", songCount: 0, hasSermon: false },
];

function setup(canEdit = true) {
  const props = { onMonthChange: vi.fn(), onOpen: vi.fn(), onCreate: vi.fn() };
  render(<ServicesCalendar month="2026-11" services={services} canEdit={canEdit} {...props} />);
  return props;
}

describe("ServicesCalendar", () => {
  it("mostra o mês com os cultos de cada dia, em ordem de horário", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Novembro de 2026" })).toBeInTheDocument();
    expect(screen.getByText("2 cultos")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /^\d+h/ }).map((b) => b.textContent);
    expect(buttons[0]).toContain("9h30");
    expect(buttons[1]).toContain("19h");
    expect(screen.queryByText("Fora do mês")).not.toBeInTheDocument();
  });

  it("clicar no culto abre; clicar num dia vazio cria naquela data", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^19h/ }));
    expect(props.onOpen).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: "Criar culto em 3 de novembro" }));
    expect(props.onCreate).toHaveBeenCalledWith("2026-11-03");
  });

  it("navega entre os meses", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(props.onMonthChange).toHaveBeenCalledWith("2026-12");
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(props.onMonthChange).toHaveBeenCalledWith("2026-10");
  });

  it("sem permissão de edição, dia vazio não cria", () => {
    setup(false);
    expect(screen.queryByRole("button", { name: /Criar culto/ })).not.toBeInTheDocument();
  });

  it("mês: virada de ano e valor inválido", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-02")).toBe("2026-02");
  });
});
