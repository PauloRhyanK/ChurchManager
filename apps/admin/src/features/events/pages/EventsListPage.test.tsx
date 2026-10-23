import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { AxiosError } from "axios";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsListPage from "./EventsListPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const api = vi.hoisted(() => ({ fetchEvents: vi.fn(), deleteEvent: vi.fn() }));
const perms = vi.hoisted(() => ({ edit: true, registrations: true }));

vi.mock("@/features/events/api/tenant-events-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-events-api")>()),
  ...api,
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/events/components/CreateEventWizardModal", () => ({
  CreateEventWizardModal: () => null,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (module: string, level: string) =>
      module === "EVENT_REGISTRATIONS" && !perms.registrations
        ? false
        : perms.edit || level === "VIEW",
  }),
}));

const event = {
  id: "e1",
  title: "Retiro de jovens",
  date: "2999-11-20",
  location: "Sítio Esperança",
  published: false,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <EventsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  perms.registrations = true;
  api.fetchEvents.mockResolvedValue([event]);
});

describe("EventsListPage", () => {
  it("com erro mostra só o erro, sem 'Nenhum evento criado ainda.'", async () => {
    api.fetchEvents.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    renderPage();
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum evento criado ainda.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar primeiro evento" })).not.toBeInTheDocument();
  });

  it("erro ao actualizar mostra o erro sem esconder os eventos já carregados", async () => {
    const { client } = renderPage();
    expect(await screen.findByText("Retiro de jovens")).toBeInTheDocument();

    api.fetchEvents.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["events"] });
    });

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
    expect(screen.getByText("Retiro de jovens")).toBeInTheDocument();
  });

  it("lista vazia com sucesso convida a criar o primeiro evento", async () => {
    api.fetchEvents.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Nenhum evento criado ainda.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar primeiro evento" })).toBeInTheDocument();
  });

  it("sem permissão de edição esconde 'Novo evento' e remover", async () => {
    perms.edit = false;
    renderPage();
    expect(await screen.findByText("Retiro de jovens")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Novo evento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover evento" })).not.toBeInTheDocument();
  });

  it("com permissão de edição mostra 'Novo evento' e remover", async () => {
    renderPage();
    expect(await screen.findByText("Retiro de jovens")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo evento/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover evento" })).toBeInTheDocument();
  });

  it("sem VIEW em inscrições esconde o atalho 'Inscrições'", async () => {
    perms.registrations = false;
    renderPage();
    expect(await screen.findByText("Retiro de jovens")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Inscrições" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurações" })).toBeInTheDocument();
  });

  it("com VIEW em inscrições mostra o atalho 'Inscrições'", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Inscrições" })).toHaveAttribute(
      "href",
      "/eventos/inscricoes",
    );
  });

  it("evento com data passada mostra 'Encerrado'; futuro não", async () => {
    api.fetchEvents.mockResolvedValue([
      event,
      { ...event, id: "e2", title: "Culto de Natal", date: "2020-12-24", published: true },
    ]);
    renderPage();
    const pastRow = (await screen.findByText("Culto de Natal")).closest("tr")!;
    const futureRow = screen.getByText("Retiro de jovens").closest("tr")!;
    expect(within(pastRow).getByText("Encerrado")).toBeInTheDocument();
    expect(within(futureRow).queryByText("Encerrado")).not.toBeInTheDocument();
  });
});
