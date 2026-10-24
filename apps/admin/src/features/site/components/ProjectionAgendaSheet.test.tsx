import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectionAgendaItem } from "@/features/site/api/projection-api";
import { ProjectionAgendaSheet } from "./ProjectionAgendaSheet";

const projectionApi = vi.hoisted(() => ({
  fetchProjectionAgenda: vi.fn(),
  updateProjectionSettings: vi.fn(),
}));
const perms = vi.hoisted(() => ({ modules: {} as Record<string, "VIEW" | "EDIT" | null> }));

vi.mock("@/features/site/api/projection-api", async (orig) => ({
  ...(await orig<typeof import("@/features/site/api/projection-api")>()),
  ...projectionApi,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (module: string, level: string) => {
      const granted = perms.modules[module] ?? null;
      return granted === "EDIT" || (granted === "VIEW" && level === "VIEW");
    },
  }),
}));

function item(
  key: string,
  kind: "event" | "schedule",
  sourceId: string,
  date: string,
  timeStart: string | null,
  title: string,
  hidden = false,
): ProjectionAgendaItem {
  return { key, kind, sourceId, title, date, timeStart, timeEnd: null, location: null, note: null, hidden };
}

// "Hoje" = sábado, 24/10/2026.
const ITEMS = [
  item("schedule:sab:2026-10-24", "schedule", "sab", "2026-10-24", "19:00", "Culto de Jovens"),
  item("event:e1", "event", "e1", "2026-10-25", null, "Festa da Colheita"),
  item("schedule:dom:2026-10-25", "schedule", "dom", "2026-10-25", "09:00", "Culto da Família"),
  item("schedule:sab:2026-10-31", "schedule", "sab", "2026-10-31", "19:00", "Culto de Jovens"),
  item("event:e2", "event", "e2", "2026-10-27", "20:00", "Reunião de Oração", true),
];

function renderSheet() {
  const onOpenChange = vi.fn();
  const onGoToTab = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/"
            element={<ProjectionAgendaSheet open onOpenChange={onOpenChange} onGoToTab={onGoToTab} />}
          />
          <Route path="/eventos" element={<p>Página de eventos</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenChange, onGoToTab };
}

const toggle = (name: RegExp) => screen.getAllByRole("switch", { name })[0];

describe("ProjectionAgendaSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
    vi.clearAllMocks();
    perms.modules = { SITE: "EDIT", CHURCH: "VIEW", EVENTS: "VIEW" };
    projectionApi.fetchProjectionAgenda.mockResolvedValue({ items: ITEMS, days: 7, updatedAt: null });
    projectionApi.updateProjectionSettings.mockImplementation(async (body) => ({
      items: ITEMS,
      days: 7,
      updatedAt: "2026-10-24T13:00:00.000Z",
      body,
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("agrupa por dia com Hoje, Amanhã e a data", async () => {
    renderSheet();
    const groups = await screen.findAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "Hoje",
      "Amanhã",
      "terça-feira, 27 de out.",
      "sábado, 31 de out.",
    ]);
    const amanha = within(groups[1]);
    expect(amanha.getByText("Dia todo")).toBeInTheDocument();
    expect(amanha.getByText("Evento")).toBeInTheDocument();
    expect(amanha.getByText("Programação semanal")).toBeInTheDocument();
  });

  it("oculto já vem desligado", async () => {
    renderSheet();
    await screen.findAllByRole("group");
    expect(toggle(/Reunião de Oração/)).toHaveAttribute("aria-checked", "false");
    expect(toggle(/Festa da Colheita/)).toHaveAttribute("aria-checked", "true");
  });

  it("desligar um horário semanal desliga todas as semanas dele", async () => {
    renderSheet();
    await screen.findAllByRole("group");
    fireEvent.click(toggle(/Culto de Jovens/));
    for (const sw of screen.getAllByRole("switch", { name: /Culto de Jovens/ })) {
      expect(sw).toHaveAttribute("aria-checked", "false");
    }
  });

  it("salvar envia exatamente as listas de ocultos", async () => {
    const { onOpenChange } = renderSheet();
    await screen.findAllByRole("group");
    fireEvent.click(toggle(/Culto de Jovens/));
    fireEvent.click(toggle(/Reunião de Oração/));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(projectionApi.updateProjectionSettings).toHaveBeenCalledTimes(1));
    expect(projectionApi.updateProjectionSettings.mock.calls[0][0]).toEqual({
      hiddenEventIds: [],
      hiddenScheduleIds: ["sab"],
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("fechar com alteração pede confirmação; desfazer a alteração fecha direto", async () => {
    const { onOpenChange } = renderSheet();
    await screen.findAllByRole("group");
    fireEvent.click(toggle(/Festa da Colheita/));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    fireEvent.click(toggle(/Festa da Colheita/));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("atalhos para a origem só com permissão", async () => {
    const { onGoToTab } = renderSheet();
    await screen.findAllByRole("group");
    fireEvent.click(screen.getByRole("button", { name: "Editar na Agenda Semanal" }));
    expect(onGoToTab).toHaveBeenCalledWith("agenda");
    expect(screen.getByRole("button", { name: "Abrir Eventos" })).toBeInTheDocument();
  });

  it("sem permissões extras e só leitura: sem atalhos, sem Salvar e interruptores travados", async () => {
    perms.modules = { SITE: "VIEW" };
    renderSheet();
    await screen.findAllByRole("group");
    expect(screen.queryByRole("button", { name: "Editar na Agenda Semanal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir Eventos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
    expect(toggle(/Festa da Colheita/)).toBeDisabled();
  });

  it("Abrir Eventos com alteração pendente pede confirmação antes de sair", async () => {
    renderSheet();
    await screen.findAllByRole("group");
    fireEvent.click(toggle(/Festa da Colheita/));
    fireEvent.click(screen.getByRole("button", { name: "Abrir Eventos" }));
    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    expect(screen.queryByText("Página de eventos")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(await screen.findByText("Página de eventos")).toBeInTheDocument();
  });

  it("reabrir busca a agenda de novo (sem prévia velha)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    const ui = (open: boolean) => (
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProjectionAgendaSheet open={open} onOpenChange={vi.fn()} onGoToTab={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(ui(true));
    await screen.findAllByRole("group");
    rerender(ui(false));
    rerender(ui(true));
    await waitFor(() => expect(projectionApi.fetchProjectionAgenda).toHaveBeenCalledTimes(2));
  });
});
