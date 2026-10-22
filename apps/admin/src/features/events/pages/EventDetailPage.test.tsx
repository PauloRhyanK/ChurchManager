import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { AxiosError } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventDetailPage } from "./EventDetailPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const eventsApi = vi.hoisted(() => ({ fetchEvent: vi.fn(), fetchEventReport: vi.fn() }));
const ticketsApi = vi.hoisted(() => ({
  fetchEventTicketTypes: vi.fn(),
  deleteEventTicketType: vi.fn(),
  duplicateEventTicketType: vi.fn(),
}));
const registrationsApi = vi.hoisted(() => ({ fetchEventRegistrations: vi.fn() }));
const perms = vi.hoisted(() => ({ edit: true }));

vi.mock("@/features/events/api/tenant-events-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-events-api")>()),
  ...eventsApi,
}));
vi.mock("@/features/events/api/tenant-event-ticket-types-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-ticket-types-api")>()),
  ...ticketsApi,
}));
vi.mock("@/features/events/api/tenant-event-registrations-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-registrations-api")>()),
  ...registrationsApi,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (_m: string, level: string) => perms.edit || level === "VIEW" }),
}));
vi.mock("@/features/events/components/EventSiteDetailsTab", () => ({
  EventSiteDetailsTab: () => null,
}));
vi.mock("@/features/events/components/TicketTypeWizardDialog", () => ({
  TicketTypeWizardDialog: () => null,
}));
vi.mock("@/features/events/components/EventPaymentLinkDialog", () => ({
  EventPaymentLinkDialog: () => null,
}));
vi.mock("@/features/events/components/EventReportSection", () => ({
  EventReportSection: () => null,
}));

const NETWORK_ERROR = /Não foi possível conectar ao servidor/;

const event = {
  id: "e1",
  title: "Conferência de mulheres",
  date: "2026-11-20",
  timeStart: null,
  location: null,
  published: true,
};

const ticket = {
  id: "t1",
  name: "Inteira",
  priceCents: 5000,
  quantitySold: 3,
  quantityTotal: 100,
  visibility: "PUBLIC",
  active: true,
  isSoldOut: false,
};

const clickTab = (name: RegExp) => {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab);
  fireEvent.mouseDown(tab);
  fireEvent.pointerUp(tab);
  fireEvent.mouseUp(tab);
  fireEvent.click(tab);
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/eventos/e1"]}>
        <Routes>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  eventsApi.fetchEvent.mockResolvedValue(event);
  // Relatório fica a carregar: estes testes não o abrem.
  eventsApi.fetchEventReport.mockReturnValue(new Promise(() => {}));
  ticketsApi.fetchEventTicketTypes.mockResolvedValue([ticket]);
  registrationsApi.fetchEventRegistrations.mockResolvedValue([]);
});

describe("EventDetailPage", () => {
  it("erros de ingressos, inscrições e relatório aparecem em cada aba em vez de vazio", async () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    ticketsApi.fetchEventTicketTypes.mockRejectedValue(networkError);
    registrationsApi.fetchEventRegistrations.mockRejectedValue(networkError);
    eventsApi.fetchEventReport.mockRejectedValue(networkError);
    renderPage();

    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum tipo de ingresso configurado.")).not.toBeInTheDocument();

    clickTab(/Inscrições/);
    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma inscrição neste evento.")).not.toBeInTheDocument();

    clickTab(/Relatório/);
    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument();
  });

  it("sem permissão de edição esconde Editar e os botões que alteram ingressos", async () => {
    perms.edit = false;
    renderPage();
    expect(await screen.findByText("Inteira")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Novo tipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover tipo de ingresso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link de pagamento" })).not.toBeInTheDocument();
  });

  it("com permissão de edição mostra Editar e os botões dos ingressos", async () => {
    renderPage();
    expect(await screen.findByText("Inteira")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Editar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo tipo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover tipo de ingresso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link de pagamento" })).toBeInTheDocument();
  });
});
