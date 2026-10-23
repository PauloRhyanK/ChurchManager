import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { EventDto } from "@/features/events/api/tenant-events-api";
import { EventDetailPage } from "./EventDetailPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const eventsApi = vi.hoisted(() => ({
  fetchEvent: vi.fn(),
  fetchEventReport: vi.fn(),
  fetchPublicSiteUrl: vi.fn(),
  updateEvent: vi.fn(),
}));
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const NETWORK_ERROR = /Não foi possível conectar ao servidor/;

const PUBLIC_SITE_URL = "https://igreja.exemplo";
const PAST_DATE = "2020-01-05";

const event = {
  id: "e1",
  title: "Conferência de mulheres",
  date: "2999-11-20",
  timeStart: null,
  timeEnd: null,
  format: "IN_PERSON",
  onlineUrl: null,
  location: null,
  published: true,
} as unknown as EventDto;

// "Servidor" em memória: o GET devolve o que o último PUT gravou, como a API real.
let serverEvent: EventDto;

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
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={["/eventos/e1"]}>
        <Routes>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  serverEvent = { ...event };
  eventsApi.fetchEvent.mockImplementation(async () => ({ ...serverEvent }));
  eventsApi.updateEvent.mockImplementation(async (_id: string, body: Partial<EventDto>) => {
    serverEvent = { ...serverEvent, ...body };
    return { ...serverEvent };
  });
  eventsApi.fetchPublicSiteUrl.mockResolvedValue({ publicSiteUrl: PUBLIC_SITE_URL });
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

describe("EventDetailPage — cabeçalho", () => {
  it("evento com data passada mostra o badge 'Encerrado'", async () => {
    serverEvent = { ...event, date: PAST_DATE };
    renderPage();
    expect(await screen.findByText("Encerrado")).toBeInTheDocument();
  });

  it("evento futuro não mostra 'Encerrado'", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: event.title })).toBeInTheDocument();
    expect(screen.queryByText("Encerrado")).not.toBeInTheDocument();
  });

  it("publicado com endereço do site: 'Ver no site' abre a página do evento em nova aba", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /Ver no site/ });
    expect(link).toHaveAttribute("href", `${PUBLIC_SITE_URL}/evento/e1`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("rascunho: 'Ver no site' desabilitado com explicação e aviso de rascunho", async () => {
    serverEvent = { ...event, published: false };
    renderPage();
    const button = await screen.findByRole("button", { name: /Ver no site/ });
    expect(button).toBeDisabled();
    expect(screen.getByTitle("Publique o evento para vê-lo no site")).toContainElement(button);
    expect(screen.queryByRole("link", { name: /Ver no site/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("Este evento é um rascunho e não aparece no site."),
    ).toBeInTheDocument();
  });

  it("publicado não mostra o aviso de rascunho", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /Ver no site/ })).toBeInTheDocument();
    expect(
      screen.queryByText("Este evento é um rascunho e não aparece no site."),
    ).not.toBeInTheDocument();
  });

  it("sem endereço do site não mostra 'Ver no site'", async () => {
    eventsApi.fetchPublicSiteUrl.mockResolvedValue({ publicSiteUrl: null });
    const { client } = renderPage();
    expect(await screen.findByRole("heading", { name: event.title })).toBeInTheDocument();
    await waitFor(() =>
      expect(client.getQueryState(["tenant-public-site"])?.status).toBe("success"),
    );
    expect(screen.queryByText(/Ver no site/)).not.toBeInTheDocument();
  });

  it("switch 'Publicado' despublica o evento e avisa", async () => {
    renderPage();
    const toggle = await screen.findByRole("switch", { name: "Publicado" });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(eventsApi.updateEvent).toHaveBeenCalledWith("e1", { published: false }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Evento despublicado."));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Publicado" })).not.toBeChecked(),
    );
    expect(
      await screen.findByText("Este evento é um rascunho e não aparece no site."),
    ).toBeInTheDocument();
  });

  it("switch 'Publicado' publica um rascunho e avisa", async () => {
    serverEvent = { ...event, published: false };
    renderPage();
    const toggle = await screen.findByRole("switch", { name: "Publicado" });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(eventsApi.updateEvent).toHaveBeenCalledWith("e1", { published: true }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Evento publicado no site."));
    expect(await screen.findByRole("link", { name: /Ver no site/ })).toBeInTheDocument();
  });

  it("sem permissão de edição não mostra o switch 'Publicado'", async () => {
    perms.edit = false;
    renderPage();
    expect(await screen.findByRole("heading", { name: event.title })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("mostra o horário de fim e o link de transmissão do evento online", async () => {
    serverEvent = {
      ...event,
      timeStart: "13:00:00",
      timeEnd: "17:00:00",
      format: "ONLINE",
      onlineUrl: "https://youtube.com/live/abc",
    };
    renderPage();
    expect(await screen.findByText(/13:00 – 17:00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /youtube\.com\/live\/abc/ })).toHaveAttribute(
      "href",
      "https://youtube.com/live/abc",
    );
  });
});
