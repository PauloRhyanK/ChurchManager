import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { AxiosError } from "axios";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegistrationsPage from "./RegistrationsPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
const NETWORK_ERROR = /Não foi possível conectar ao servidor/;

const api = vi.hoisted(() => ({ fetchAllRegistrations: vi.fn() }));

vi.mock("@/features/events/api/tenant-event-registrations-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-registrations-api")>()),
  ...api,
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const registration = {
  id: "r1",
  eventId: "e1",
  name: "Maria Souza",
  email: "maria@exemplo.com",
  phone: null,
  message: null,
  userId: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  event: { title: "Retiro de jovens", date: "2999-11-20", tag: null },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <RegistrationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAllRegistrations.mockResolvedValue([registration]);
});

describe("RegistrationsPage", () => {
  it("com erro e sem dados mostra só o erro", async () => {
    api.fetchAllRegistrations.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    renderPage();
    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma inscrição registada.")).not.toBeInTheDocument();
  });

  it("erro ao actualizar mostra o erro sem esconder as inscrições já carregadas", async () => {
    const { client } = renderPage();
    expect(await screen.findByText("Maria Souza")).toBeInTheDocument();

    api.fetchAllRegistrations.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["all-registrations"] });
    });

    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
  });
});
