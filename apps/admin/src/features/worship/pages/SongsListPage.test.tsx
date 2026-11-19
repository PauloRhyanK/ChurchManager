import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongSummary } from "../api/worship-api";
import SongsListPage from "./SongsListPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const api = vi.hoisted(() => ({ fetchSongs: vi.fn() }));
const perms = vi.hoisted(() => ({ edit: true }));

vi.mock("../api/worship-api", async (orig) => ({ ...(await orig<typeof import("../api/worship-api")>()), ...api }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (_module: string, level: string) => perms.edit || level === "VIEW" }),
}));

const song = (over: Partial<SongSummary>): SongSummary => ({
  id: "s1",
  title: "Luz da Manhã",
  artist: null,
  musicalKey: "Sol",
  bpm: 72,
  timeSignature: null,
  status: "READY",
  pending: [],
  slideCount: 14,
  audio: { url: "https://cdn/a.mp3", fileName: "a.mp3", durationSeconds: 252, sizeBytes: 1 },
  readyAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
  ...over,
});

const SONGS = [
  song({}),
  song({ id: "s2", title: "Canto Novo", status: "NEEDS_TIMING", pending: ["TIMES"], musicalKey: "Mi", bpm: 140, readyAt: null }),
  song({ id: "s3", title: "Firme Rocha", status: "NEEDS_TIMING", pending: ["CONFIRM"], readyAt: null }),
  song({ id: "s4", title: "Casa Aberta", status: "DRAFT", musicalKey: null, bpm: null, audio: null, slideCount: 0, readyAt: null }),
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <SongsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  api.fetchSongs.mockResolvedValue({ items: SONGS, counts: { all: 4, ready: 1, pending: 3 } });
});

describe("SongsListPage", () => {
  it("mostra ficha e situação de cada música", async () => {
    renderPage();
    const pronta = (await screen.findByText("Luz da Manhã")).closest("a") as HTMLElement;
    expect(pronta).toHaveAttribute("href", "/cultos/musicas/s1");
    expect(pronta).toHaveTextContent("Sol · 72 bpm · 4:12");
    expect(pronta).toHaveTextContent("Pronta");
    expect(screen.getByText("Canto Novo").closest("a")).toHaveTextContent("Falta o tempo");
    expect(screen.getByText("Firme Rocha").closest("a")).toHaveTextContent("Falta conferir");
    const rascunho = screen.getByText("Casa Aberta").closest("a") as HTMLElement;
    expect(rascunho).toHaveTextContent("Só a letra");
    expect(rascunho).toHaveTextContent("Rascunho");
  });

  it("filtra por situação e pela busca sem acento", async () => {
    renderPage();
    await screen.findByText("Luz da Manhã");
    fireEvent.click(screen.getByRole("button", { name: "Pendentes 3" }));
    expect(screen.queryByText("Luz da Manhã")).not.toBeInTheDocument();
    expect(screen.getByText("Casa Aberta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todas 4" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar música" }), { target: { value: "manha" } });
    expect(screen.getByText("Luz da Manhã")).toBeInTheDocument();
    expect(screen.queryByText("Canto Novo")).not.toBeInTheDocument();
  });

  it("sem permissão de edição não oferece Nova música", async () => {
    perms.edit = false;
    renderPage();
    await screen.findByText("Luz da Manhã");
    expect(screen.queryByRole("link", { name: /Nova música/ })).not.toBeInTheDocument();
  });

  it("repertório vazio convida a criar a primeira", async () => {
    api.fetchSongs.mockResolvedValue({ items: [], counts: { all: 0, ready: 0, pending: 0 } });
    renderPage();
    expect(await screen.findByText("Nenhuma música no repertório ainda.")).toBeInTheDocument();
  });
});
