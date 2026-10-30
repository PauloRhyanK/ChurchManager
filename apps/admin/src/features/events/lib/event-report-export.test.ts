import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EventReportDto } from "@/features/events/api/tenant-events-api";
import { exportReportPdf, exportReportSpreadsheet } from "./event-report-export";

const sampleReport: EventReportDto = {
  event: {
    id: "e1",
    title: "Conferência de Jovens",
    date: "2026-11-15",
    published: true,
  },
  confirmedRevenueCents: 15000,
  ticketsIssued: 30,
  ticketsSold: 30,
  registrationCount: 10,
  salesPeriodStart: null,
  ordersSummary: [
    { status: "RECEIVED", count: 25, totalCents: 12500 },
    { status: "PENDING", count: 5, totalCents: 2500 },
  ],
  ticketTypes: [
    {
      id: "t1",
      name: "Geral",
      priceCents: 500,
      quantityTotal: 50,
      quantitySold: 30,
      quantityRemaining: 20,
      active: true,
      revenueCents: 15000,
    },
  ],
  registrationsByDay: [{ date: "2026-10-01", count: 12 }],
};

describe("event-report-export", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exportReportSpreadsheet gera e dispara o download do CSV", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(val: string) {},
      set download(val: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    exportReportSpreadsheet(sampleReport);

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("exportReportPdf abre janela para impressão do PDF", () => {
    const mockWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);

    exportReportPdf(sampleReport);

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(mockWindow.document.write).toHaveBeenCalledWith(
      expect.stringContaining("Relatório — Conferência de Jovens"),
    );
    expect(mockWindow.document.close).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
    expect(mockWindow.print).toHaveBeenCalled();
  });
});
