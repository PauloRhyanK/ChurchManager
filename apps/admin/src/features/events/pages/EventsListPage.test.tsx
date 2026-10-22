import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { AxiosError } from "axios";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsListPage from "./EventsListPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const api = vi.hoisted(() => ({ fetchEvents: vi.fn(), deleteEvent: vi.fn() }));
const perms = vi.hoisted(() => ({ edit: true }));

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
  usePermissions: () => ({ can: (_m: string, level: string) => perms.edit || level === "VIEW" }),
}));

const event = {
  id: "e1",
  title: "Retiro de jovens",
  date: "2026-11-20",
  location: "Sítio Esperança",
  published: false,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <EventsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
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
});
