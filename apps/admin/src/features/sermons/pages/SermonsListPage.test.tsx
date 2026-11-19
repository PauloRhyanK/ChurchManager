import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SermonSummary } from "../api/sermons-api";
import SermonsListPage from "./SermonsListPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const api = vi.hoisted(() => ({ listSermons: vi.fn(), createSermon: vi.fn() }));
const perms = vi.hoisted(() => ({ edit: true }));

vi.mock("../api/sermons-api", async (orig) => ({ ...(await orig<typeof import("../api/sermons-api")>()), ...api }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (_module: string, level: string) => perms.edit || level === "VIEW" }),
}));

const sermon = (over: Partial<SermonSummary>): SermonSummary => ({
  id: "p1",
  title: "A luz do mundo",
  baseReference: "João 8:12",
  pointCount: 3,
  estimatedSeconds: 1680,
  status: "DRAFT",
  delivery: null,
  updatedAt: "2026-11-19T00:00:00.000Z",
  ...over,
});

const ALL = [
  sermon({}),
  sermon({
    id: "p2",
    title: "Firmes na fé",
    baseReference: null,
    pointCount: 0,
    status: "SENT",
    delivery: { date: "2026-11-22", startTime: "19:00", serviceId: null, serviceName: null },
  }),
  sermon({
    id: "p3",
    title: "Casa sobre a rocha",
    pointCount: 1,
    status: "PREACHED",
    delivery: { date: "2026-11-15", startTime: "09:00", serviceId: null, serviceName: null },
  }),
];
const COUNTS = { all: 3, draft: 1, sent: 1, preached: 1 };

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/" element={<SermonsListPage />} />
          <Route path="/palavras/:id" element={<p>Editor aberto</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  api.listSermons.mockImplementation(async ({ status }: { status?: string } = {}) => ({
    items: status ? ALL.filter((s) => s.status === status) : ALL,
    counts: COUNTS,
  }));
});

describe("SermonsListPage", () => {
  it("mostra título, base e situação de cada palavra, com link para o editor", async () => {
    renderPage();
    const rascunho = (await screen.findByText("A luz do mundo")).closest("a") as HTMLElement;
    expect(rascunho).toHaveAttribute("href", "/palavras/p1");
    expect(rascunho).toHaveTextContent("João 8:12 · 3 pontos");
    expect(rascunho).toHaveTextContent("Rascunho");
    const enviada = screen.getByText("Firmes na fé").closest("a") as HTMLElement;
    expect(enviada).toHaveTextContent("sem pontos ainda");
    expect(enviada).toHaveTextContent("Enviada · dom 22/11, 19h");
    expect(screen.getByText("Casa sobre a rocha").closest("a")).toHaveTextContent("Pregada · dom 15/11");
  });

  it("filtra por situação", async () => {
    renderPage();
    await screen.findByText("A luz do mundo");
    fireEvent.click(screen.getByRole("button", { name: "Enviadas 1" }));
    await waitFor(() => expect(screen.queryByText("A luz do mundo")).not.toBeInTheDocument());
    expect(api.listSermons).toHaveBeenLastCalledWith({ q: "", status: "SENT" });
    expect(screen.getByText("Firmes na fé")).toBeInTheDocument();
  });

  it("procura depois de 300 ms de pausa", async () => {
    renderPage();
    await screen.findByText("A luz do mundo");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar palavra" }), { target: { value: "rocha" } });
    expect(api.listSermons).not.toHaveBeenCalledWith({ q: "rocha", status: undefined });
    await waitFor(() => expect(api.listSermons).toHaveBeenCalledWith({ q: "rocha", status: undefined }));
  });

  it("Nova palavra cria e abre o editor", async () => {
    api.createSermon.mockResolvedValue(sermon({ id: "novo" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nova palavra/ }));
    expect(await screen.findByText("Editor aberto")).toBeInTheDocument();
    expect(api.createSermon).toHaveBeenCalledWith({});
  });

  it("Nova palavra invalida a lista (a volta do editor não mostra a lista velha)", async () => {
    api.createSermon.mockResolvedValue(sermon({ id: "novo" }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, "invalidateQueries");
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Nova palavra/ }));
    await screen.findByText("Editor aberto");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["sermons", "list"] });
  });

  it("sem permissão de edição não oferece Nova palavra", async () => {
    perms.edit = false;
    renderPage();
    await screen.findByText("A luz do mundo");
    expect(screen.queryByRole("button", { name: /Nova palavra/ })).not.toBeInTheDocument();
  });

  it("biblioteca vazia convida a escrever a primeira", async () => {
    api.listSermons.mockResolvedValue({ items: [], counts: { all: 0, draft: 0, sent: 0, preached: 0 } });
    renderPage();
    expect(await screen.findByText("Você ainda não escreveu nenhuma palavra.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Nova palavra/ })).toHaveLength(2);
  });

  it("busca sem resultado mostra a mensagem própria", async () => {
    renderPage();
    await screen.findByText("A luz do mundo");
    api.listSermons.mockResolvedValue({ items: [], counts: COUNTS });
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar palavra" }), { target: { value: "zzz" } });
    expect(await screen.findByText("Nenhuma palavra encontrada.")).toBeInTheDocument();
  });
});
