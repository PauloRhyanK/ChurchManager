import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatMinutes, momentTimes } from "../lib/schedule";
import ServiceTemplatesPage from "./ServiceTemplatesPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
const api = vi.hoisted(() => ({
  fetchTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));
const perms = vi.hoisted(() => ({ edit: true }));

vi.mock("../api/worship-api", async (orig) => ({ ...(await orig<typeof import("../api/worship-api")>()), ...api }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (_m: string, level: string) => perms.edit || level === "VIEW" }),
}));

const PADRAO = {
  id: null,
  name: "Culto padrão",
  startTime: "19:00",
  moments: [
    { name: "Pré-culto", kind: "PRE_SERVICE", durationMinutes: 15 },
    { name: "Louvor", kind: "WORSHIP", durationMinutes: 17 },
    { name: "Palavra", kind: "SERMON", durationMinutes: 40 },
  ],
};
const DOMINGO = {
  id: "t1",
  name: "Domingo à noite",
  startTime: "19:00",
  moments: [
    { name: "Louvor", kind: "WORSHIP", durationMinutes: 25 },
    { name: "Palavra", kind: "SERMON", durationMinutes: 70 },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <ServiceTemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  api.fetchTemplates.mockResolvedValue([DOMINGO]);
  api.createTemplate.mockResolvedValue(DOMINGO);
  api.updateTemplate.mockResolvedValue(DOMINGO);
  api.deleteTemplate.mockResolvedValue(undefined);
});

describe("horários de um modelo", () => {
  it("pré-culto conta para trás; total e fim somam as durações", () => {
    const out = momentTimes("19:00", PADRAO.moments as never);
    expect(out.startsAt).toEqual(["18:45", "19:00", "19:17"]);
    expect(out.endsAt).toBe("19:57");
    expect(out.totalMinutes).toBe(72);
    expect([formatMinutes(72), formatMinutes(40), formatMinutes(120)]).toEqual(["1 h 12 min", "40 min", "2 h"]);
  });
});

describe("ServiceTemplatesPage", () => {
  it("lista o modelo com quantidade de momentos e duração total", async () => {
    renderPage();
    const row = (await screen.findByText("Domingo à noite")).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("2 momentos · 1 h 35 min · começa às 19:00");
    expect(screen.getByText(/não altera os cultos já criados/)).toBeInTheDocument();
  });

  it("editar: muda o nome, acrescenta um momento e salva a lista inteira, sem ids", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/não muda os cultos já criados a partir dele/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome do modelo"), { target: { value: "Domingo 19h" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Adicionar momento/ }));
    fireEvent.change(within(dialog).getByLabelText("Tipo de Novo momento"), { target: { value: "PRE_SERVICE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() => expect(api.updateTemplate).toHaveBeenCalledTimes(1));
    expect(api.updateTemplate).toHaveBeenCalledWith("t1", {
      name: "Domingo 19h",
      startTime: "19:00",
      moments: [...DOMINGO.moments, { name: "Novo momento", kind: "PRE_SERVICE", durationMinutes: 5 }],
    });
    expect(api.createTemplate).not.toHaveBeenCalled();
  });

  it("novo modelo: sem nome não salva; com nome cria do zero", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Novo modelo/ }));
    const dialog = await screen.findByRole("dialog");
    const criar = within(dialog).getByRole("button", { name: "Criar modelo" });
    expect(criar).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Nome do modelo"), { target: { value: "Quarta" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover Abertura" }));
    fireEvent.click(criar);
    await waitFor(() => expect(api.createTemplate).toHaveBeenCalledTimes(1));
    expect(api.createTemplate).toHaveBeenCalledWith({
      name: "Quarta",
      startTime: "19:00",
      moments: [
        { name: "Louvor", kind: "WORSHIP", durationMinutes: 20 },
        { name: "Palavra", kind: "SERMON", durationMinutes: 40 },
      ],
    });
  });

  it("modelo sem nenhum momento não pode ser salvo", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover Louvor" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover Palavra" }));
    expect(within(dialog).getByText("O modelo precisa de pelo menos um momento.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Salvar modelo" })).toBeDisabled();
  });

  it("excluir pede confirmação e avisa que os cultos continuam iguais", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir o modelo Domingo à noite" }));
    expect(await screen.findByText(/continuam iguais/)).toBeInTheDocument();
    expect(api.deleteTemplate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir modelo" }));
    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith("t1"));
  });

  it("sem modelo próprio: o padrão do sistema aparece e Personalizar cria um modelo de verdade", async () => {
    api.fetchTemplates.mockResolvedValue([PADRAO]);
    renderPage();
    const row = (await screen.findByText("Culto padrão")).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("Padrão do sistema");
    expect(within(row).queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /Personalizar/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Criar modelo" }));
    await waitFor(() => expect(api.createTemplate).toHaveBeenCalledTimes(1));
    expect(api.createTemplate).toHaveBeenCalledWith({ name: "Culto padrão", startTime: "19:00", moments: PADRAO.moments });
    expect(api.updateTemplate).not.toHaveBeenCalled();
  });

  it("só com Ver: lista, mas não cria, edita nem exclui", async () => {
    perms.edit = false;
    renderPage();
    await screen.findByText("Domingo à noite");
    expect(screen.queryByRole("button", { name: /Novo modelo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });
});
