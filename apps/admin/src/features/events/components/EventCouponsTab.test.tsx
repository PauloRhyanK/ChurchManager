import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventCouponsTab } from "./EventCouponsTab";
import type { EventCouponDto } from "@/features/events/api/tenant-event-coupons-api";
import type { EventTicketTypeDto } from "@/features/events/api/tenant-event-ticket-types-api";

const couponApi = vi.hoisted(() => ({
  fetchEventCoupons: vi.fn(),
  deleteEventCoupon: vi.fn(),
  updateEventCoupon: vi.fn(),
}));

vi.mock("@/features/events/api/tenant-event-coupons-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-coupons-api")>()),
  ...couponApi,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockTicketTypes: EventTicketTypeDto[] = [
  {
    id: "t1",
    eventId: "e1",
    name: "VIP",
    description: null,
    priceCents: 10000,
    feeCents: 0,
    quantityTotal: 50,
    quantitySold: 10,
    quantityRemaining: 40,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesOpensAt: null,
    salesClosesAt: null,
    visibility: "PUBLIC",
    allowGuestRegistration: true,
    communityLink: null,
    allowedBillingTypes: ["PIX"],
    maxInstallments: null,
    isSoldOut: false,
    active: true,
    fields: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

const mockCoupons: EventCouponDto[] = [
  {
    id: "c1",
    tenantId: "tenant-1",
    eventId: "e1",
    code: "PROMO20",
    name: "Desconto 20%",
    discountType: "PERCENTAGE",
    discountValue: 20,
    maxUses: 50,
    usedCount: 5,
    maxUsesPerCpf: 1,
    validFrom: null,
    validUntil: null,
    active: true,
    ticketTypeIds: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("EventCouponsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza tela vazia quando não há cupons", async () => {
    couponApi.fetchEventCoupons.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <EventCouponsTab eventId="e1" ticketTypes={mockTicketTypes} canEdit={true} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum cupom cadastrado")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Criar primeiro cupom" })).toBeInTheDocument();
  });

  it("renderiza listagem de cupons com código e badge", async () => {
    couponApi.fetchEventCoupons.mockResolvedValue(mockCoupons);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <EventCouponsTab eventId="e1" ticketTypes={mockTicketTypes} canEdit={true} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("PROMO20")).toBeInTheDocument();
      expect(screen.getByText("20%")).toBeInTheDocument();
      expect(screen.getByText("Desconto 20%")).toBeInTheDocument();
    });
  });

  it("oculta botões de criação se canEdit for falso", async () => {
    couponApi.fetchEventCoupons.mockResolvedValue(mockCoupons);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <EventCouponsTab eventId="e1" ticketTypes={mockTicketTypes} canEdit={false} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("PROMO20")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Novo cupom" })).not.toBeInTheDocument();
  });
});
