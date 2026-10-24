import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError } from "axios";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChurchPage from "./ChurchPage";

const api = vi.hoisted(() => ({
  fetchBranches: vi.fn(),
  fetchPastors: vi.fn(),
  fetchMinistries: vi.fn(),
  fetchSchedules: vi.fn(),
  fetchChurchConfig: vi.fn(),
  updateChurchConfig: vi.fn(),
  createBranch: vi.fn(),
}));
const perms = vi.hoisted(() => ({ edit: true, denied: [] as string[] }));

vi.mock("../api/church-api", async (orig) => ({
  ...(await orig<typeof import("../api/church-api")>()),
  ...api,
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (module: string, level: string) =>
      !perms.denied.includes(module) && (perms.edit || level === "VIEW"),
  }),
}));
vi.mock("@/components/ImageUploader", () => ({ ImageUploader: () => null }));
// A aba Site tem testes próprios; aqui só interessa como conversa com a página.
vi.mock("@/features/site/components/SiteFlowTab", () => ({
  SiteFlowTab: ({
    onDirtyChange,
    onGoToTab,
  }: {
    onDirtyChange: (dirty: boolean) => void;
    onGoToTab: (tab: string) => void;
  }) => (
    <div>
      <p>Fluxo do site</p>
      <button onClick={() => onDirtyChange(true)}>Mudar ordem</button>
      <button onClick={() => onGoToTab("agenda")}>Ir para agenda</button>
    </div>
  ),
}));

function LocationSearch() {
  return <output data-testid="search">{useLocation().search}</output>;
}

const config = {
  id: "c1",
  tenantId: "t1",
  pixKey: "pix@igreja.com",
  bankName: null,
  bankCode: null,
  agency: null,
  account: null,
  holderName: null,
  holderDocument: null,
  youtubeUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  phone: "123",
  email: null,
  address: null,
};
const branch = {
  id: "b1",
  name: "Sede Centro",
  location: null,
  address: null,
  image: null,
  mapsUrl: null,
  isHeadquarters: true,
  active: true,
  sortOrder: 0,
  createdAt: "",
  updatedAt: "",
};

const user = {
  // Radix usa pointer events; fireEvent.click basta para botões/abas em jsdom.
  click: async (el: HTMLElement) => {
    fireEvent.pointerDown(el);
    fireEvent.mouseDown(el);
    fireEvent.pointerUp(el);
    fireEvent.mouseUp(el);
    fireEvent.click(el);
  },
  type: async (el: HTMLElement, text: string) => {
    fireEvent.change(el, { target: { value: (el as HTMLInputElement).value + text } });
  },
  escape: async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
  },
};

function renderPage(path = "/igreja") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[path]}
      >
        <ChurchPage />
        <LocationSearch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  perms.denied = [];
  api.fetchBranches.mockResolvedValue([branch]);
  api.fetchPastors.mockResolvedValue([]);
  api.fetchMinistries.mockResolvedValue([]);
  api.fetchSchedules.mockResolvedValue([]);
  api.fetchChurchConfig.mockResolvedValue(config);
});

describe("ChurchPage", () => {
  it("GET falhando mostra erro com 'Tentar novamente', não 'Nenhuma … cadastrada'", async () => {
    api.fetchBranches.mockRejectedValueOnce(new AxiosError("Network Error", "ERR_NETWORK"));
    renderPage();
    expect(await screen.findByText("Não foi possível carregar os dados")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma filial cadastrada ainda.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Sede Centro")).toBeInTheDocument();
  });

  it("lista vazia com sucesso mostra o texto de vazio", async () => {
    api.fetchBranches.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Nenhuma filial cadastrada ainda.")).toBeInTheDocument();
  });

  it("configuração com GET falhando não renderiza o formulário (nem o botão salvar)", async () => {
    api.fetchChurchConfig.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Ofertório/ }));
    expect(await screen.findByText("Não foi possível carregar os dados")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chave PIX")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar Alterações" })).not.toBeInTheDocument();
    expect(api.updateChurchConfig).not.toHaveBeenCalled();
  });

  it("fechar diálogo sujo pede confirmação; sem alterações fecha direto", async () => {
    renderPage();
    await screen.findByText("Sede Centro");
    await user.click(screen.getByRole("button", { name: /Adicionar filial/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Adicionar filial/ }));
    await user.type(await screen.findByLabelText("Nome da Filial *"), "Nova");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByLabelText("Nome da Filial *")).toHaveValue("Nova");
    await user.escape();
    await user.click(await screen.findByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByLabelText("Nome da Filial *")).not.toBeInTheDocument());
  });

  it("trocar de aba com configuração alterada pede confirmação", async () => {
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Ofertório/ }));
    await user.type(await screen.findByLabelText("Telefone"), "9");
    await user.click(screen.getByRole("tab", { name: /Filiais/ }));
    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toHaveValue("1239");
  });

  it("beforeunload é bloqueado com alteração pendente", async () => {
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Ofertório/ }));
    const evt = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    await screen.findByLabelText("Telefone");
    expect(evt()).toBe(false);
    await user.type(screen.getByLabelText("Telefone"), "9");
    await waitFor(() => expect(evt()).toBe(true));
  });

  it("com CHURCH:VIEW não há botões de escrita e o formulário é somente leitura", async () => {
    perms.edit = false;
    renderPage();
    await screen.findByText("Sede Centro");
    expect(screen.queryByRole("button", { name: /Adicionar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar Alterações" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("tbody button")).toHaveLength(0);
    await user.click(screen.getByRole("tab", { name: /Ofertório/ }));
    expect(await screen.findByLabelText("Chave PIX")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar Alterações" })).not.toBeInTheDocument();
  });

  it("exclusão usa AlertDialog com o nome do item", async () => {
    renderPage();
    await screen.findByText("Sede Centro");
    const confirmSpy = vi.spyOn(window, "confirm");
    const buttons = document.querySelectorAll("tbody button");
    fireEvent.click(buttons[1]);
    expect(await screen.findByText(/"Sede Centro" será removido/)).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("?aba= abre a aba pedida e trocar de aba atualiza a URL", async () => {
    renderPage("/igreja?aba=pastores");
    expect(screen.getByRole("tab", { name: /Pastores/ })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: /Agenda Semanal/ }));
    expect(screen.getByTestId("search")).toHaveTextContent("?aba=agenda");
    expect(screen.getByRole("tab", { name: /Agenda Semanal/ })).toHaveAttribute("aria-selected", "true");
  });

  it("?aba= desconhecida cai na primeira aba", async () => {
    renderPage("/igreja?aba=xyz");
    expect(screen.getByRole("tab", { name: /Filiais/ })).toHaveAttribute("aria-selected", "true");
  });

  it("só com permissão de Site: só a aba Site e nenhuma consulta de Igreja", async () => {
    perms.denied = ["CHURCH"];
    renderPage("/igreja?aba=filiais");
    expect(await screen.findByText("Fluxo do site")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual(["Site"]);
    expect(api.fetchBranches).not.toHaveBeenCalled();
    expect(api.fetchChurchConfig).not.toHaveBeenCalled();
  });

  it("sem permissão de Site a aba Site não aparece", async () => {
    perms.denied = ["SITE"];
    renderPage("/igreja?aba=site");
    expect(screen.queryByRole("tab", { name: /Site/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Filiais/ })).toHaveAttribute("aria-selected", "true");
  });

  it("ordem do site pendente pede confirmação ao trocar de aba", async () => {
    renderPage("/igreja?aba=site");
    await user.click(screen.getByRole("button", { name: "Mudar ordem" }));
    await user.click(screen.getByRole("tab", { name: /Filiais/ }));
    expect(await screen.findByText("Descartar alterações?")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?aba=site");
  });

  it("a aba Site consegue levar a outra aba", async () => {
    renderPage("/igreja?aba=site");
    await user.click(screen.getByRole("button", { name: "Ir para agenda" }));
    expect(screen.getByTestId("search")).toHaveTextContent("?aba=agenda");
  });
});
