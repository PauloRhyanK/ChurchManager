import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventParticipantsDto } from "@/features/events/api/tenant-events-api";
import type { EventRegistrationDto } from "@/features/events/api/tenant-event-registrations-api";
import { exportParticipantsPdf } from "./event-participants-export";

const data: EventParticipantsDto = {
  event: { id: "e1", title: "Conferência <Jovens>", date: "2026-11-20" },
  items: [
    {
      id: "t1",
      holderName: "Ana <script>alert(1)</script>",
      ticketTypeName: "Geral",
      publicCode: "ABC123",
      status: "VALID",
      checkedInAt: null,
      createdAt: "2026-11-01T10:00:00Z",
      orderId: "o1",
      orderStatus: "CONFIRMED",
      buyerName: "Bruno",
      buyerEmail: "b@x.com",
      buyerPhone: "11999990000",
      fields: [{ label: "Igreja", value: "Sede" }],
    },
  ],
};

const registrations: EventRegistrationDto[] = [
  {
    id: "r1",
    eventId: "e1",
    name: "Carla",
    email: "c@x.com",
    phone: null,
    message: null,
    userId: null,
    createdAt: "2026-11-02T10:00:00Z",
  },
];

describe("exportParticipantsPdf", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lista portadores, comprador, campos e inscrições, com texto escapado", () => {
    const write = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    } as unknown as Window);

    expect(exportParticipantsPdf(data, registrations)).toBe(true);

    const html = write.mock.calls[0][0] as string;
    expect(html).toContain("Ana &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Conferência &lt;Jovens&gt;");
    expect(html).toContain("Bruno");
    expect(html).toContain("<b>Igreja:</b> Sede");
    expect(html).toContain("Inscrições gratuitas (1)");
    expect(html).toContain("Carla");
  });

  it("devolve false quando o navegador bloqueia a janela", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(exportParticipantsPdf(data)).toBe(false);
  });
});
