import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFlowTab } from "./SiteFlowTab";

const siteApi = vi.hoisted(() => ({
  fetchSiteSchema: vi.fn(),
  fetchSiteSections: vi.fn(),
  fetchSiteLayout: vi.fn(),
  updateSiteLayout: vi.fn(),
}));
const churchApi = vi.hoisted(() => ({
  fetchSchedules: vi.fn(),
  fetchBranches: vi.fn(),
  fetchPastors: vi.fn(),
}));
const eventsApi = vi.hoisted(() => ({ fetchEvents: vi.fn() }));
const perms = vi.hoisted(() => ({ modules: {} as Record<string, "VIEW" | "EDIT" | null> }));

vi.mock("@/features/site/api/tenant-site-content-api", async (orig) => ({
  ...(await orig<typeof import("@/features/site/api/tenant-site-content-api")>()),
  ...siteApi,
}));
vi.mock("@/features/church/api/church-api", async (orig) => ({
  ...(await orig<typeof import("@/features/church/api/church-api")>()),
  ...churchApi,
}));
vi.mock("@/features/events/api/tenant-events-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-events-api")>()),
  ...eventsApi,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (module: string, level: string) => {
      const granted = perms.modules[module] ?? null;
      return granted === "EDIT" || (granted === "VIEW" && level === "VIEW");
    },
  }),
}));

const DEFAULT = ["mission", "schedules", "celulas", "events", "churches", "giving", "youtube"];

function section(key: string, title: string, value: Record<string, unknown> = { badge: title }) {
  return { key, title, description: "", icon: "Church", value, updatedAt: null };
}

function schedule(id: string, dayOfWeek: string, timeStart: string, active = true) {
  return {
    id,
    title: "Culto",
    dayOfWeek,
    timeStart,
    location: null,
    description: null,
    active,
    sortOrder: 0,
    createdAt: "",
  };
}

function renderTab(props: Partial<Parameters<typeof SiteFlowTab>[0]> = {}) {
  const onDirtyChange = vi.fn();
  const onGoToTab = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteFlowTab onDirtyChange={onDirtyChange} onGoToTab={onGoToTab} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onDirtyChange, onGoToTab };
}

async function homeTitles() {
  const list = await screen.findByRole("list", { name: "Página inicial" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("data-block"));
}

describe("SiteFlowTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.modules = { SITE: "EDIT", CHURCH: "VIEW", EVENTS: "VIEW" };
    siteApi.fetchSiteSchema.mockResolvedValue({ icons: [], sections: [] });
    siteApi.fetchSiteSections.mockResolvedValue([
      section("mission", "Missão / Sobre"),
      section("celulas", "Células"),
      section("churches", "Igrejas & Missões"),
      section("giving", "Ofertório"),
      section("youtube", "Transmissões"),
      section("contact", "Contato & Rodapé"),
      section("pastors", "Time Pastoral"),
      section("visit", "Venha nos visitar"),
    ]);
    siteApi.fetchSiteLayout.mockResolvedValue({
      home: ["youtube", ...DEFAULT.slice(0, -1)],
      updatedAt: null,
    });
    siteApi.updateSiteLayout.mockImplementation(async (home: string[]) => ({
      home,
      updatedAt: "2026-10-24T12:00:00.000Z",
    }));
    churchApi.fetchSchedules.mockResolvedValue([
      schedule("s1", "Domingo", "09:00:00"),
      schedule("s2", "Domingo", "18:30:00"),
      schedule("s3", "Terça", "20:00:00"),
      schedule("s4", "Quarta", "20:00:00", false),
      schedule("s5", "Sábado", "19:00:00"),
      schedule("s6", "Sexta", "20:00:00"),
    ]);
    churchApi.fetchBranches.mockResolvedValue([]);
    churchApi.fetchPastors.mockResolvedValue([]);
    eventsApi.fetchEvents.mockResolvedValue([]);
  });

  it("mostra Topo, os blocos na ordem salva e o Rodapé", async () => {
    renderTab();
    expect(await homeTitles()).toEqual(["hero", "youtube", ...DEFAULT.slice(0, -1), "contact"]);
  });

  it("mover com as setas e salvar envia a nova ordem exata", async () => {
    const { onDirtyChange } = renderTab();
    await homeTitles();

    fireEvent.click(screen.getByRole("button", { name: "Mover Células para cima" }));
    expect(await homeTitles()).toEqual([
      "hero",
      "youtube",
      "mission",
      "celulas",
      "schedules",
      "events",
      "churches",
      "giving",
      "contact",
    ]);
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole("button", { name: "Salvar ordem" }));
    await waitFor(() => expect(siteApi.updateSiteLayout).toHaveBeenCalledTimes(1));
    expect(siteApi.updateSiteLayout.mock.calls[0][0]).toEqual([
      "youtube",
      "mission",
      "celulas",
      "schedules",
      "events",
      "churches",
      "giving",
    ]);
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(screen.queryByRole("button", { name: "Salvar ordem" })).toBeNull();
  });

  it("descartar volta à ordem salva", async () => {
    renderTab();
    await homeTitles();
    fireEvent.click(screen.getByRole("button", { name: "Mover Missão / Sobre para baixo" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(await homeTitles()).toEqual(["hero", "youtube", ...DEFAULT.slice(0, -1), "contact"]);
    expect(siteApi.updateSiteLayout).not.toHaveBeenCalled();
  });

  it("Programação leva à aba Agenda Semanal e mostra só horários ativos", async () => {
    const { onGoToTab } = renderTab();
    await homeTitles();
    fireEvent.click(screen.getByRole("button", { name: "Ir para Agenda Semanal" }));
    expect(onGoToTab).toHaveBeenCalledWith("agenda");

    expect(await screen.findByText("Dom 9h e 18h30 · Ter 20h · Sex 20h +1")).toBeInTheDocument();
    expect(screen.queryByText(/Qua/)).toBeNull();
  });

  it("sem acesso a Igreja a prévia some, mas o selo de origem fica", async () => {
    perms.modules = { SITE: "EDIT" };
    renderTab();
    await homeTitles();
    expect(screen.getByText("Vem de Agenda Semanal")).toBeInTheDocument();
    expect(screen.queryByText(/Dom 9h/)).toBeNull();
    expect(churchApi.fetchSchedules).not.toHaveBeenCalled();
  });

  it("só leitura: sem setas nem alça de arrastar", async () => {
    perms.modules = { SITE: "VIEW", CHURCH: "VIEW" };
    renderTab();
    await homeTitles();
    expect(screen.queryByRole("button", { name: /^Mover / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Arrastar / })).toBeNull();
  });

  it("outras páginas: Time Pastoral e Venha nos visitar, este marcado como fora do site", async () => {
    renderTab();
    const list = await screen.findByRole("list", { name: "Outras páginas" });
    expect(within(list).getAllByRole("listitem").map((item) => item.dataset.block)).toEqual([
      "pastors",
      "visit",
    ]);
    expect(within(list).getByText("Usa Pastores")).toBeInTheDocument();
    expect(within(list).getByText("Não aparece no site")).toBeInTheDocument();
  });
});
