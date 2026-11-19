import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOC } from "../lib/document";
import SermonEditorPage from "./SermonEditorPage";

const api = vi.hoisted(() => ({
  getSermon: vi.fn(),
  updateSermon: vi.fn(),
  duplicateSermon: vi.fn(),
  deleteSermon: vi.fn(),
  listServiceOptions: vi.fn(),
  previewDelivery: vi.fn(),
  sendSermon: vi.fn(),
  cancelDelivery: vi.fn(),
}));
vi.mock("../api/sermons-api", () => api);
const perms = vi.hoisted(() => ({ canEdit: true }));
vi.mock("@/features/access/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => perms.canEdit }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Tiptap em jsdom não é o alvo aqui: a folha e a barra viram dublês simples.
const fakeEditor = { on() {}, off() {}, state: { selection: { from: 0 }, doc: { forEach() {} } } };
vi.mock("../editor/SermonSheet", () => ({
  SermonSheet: ({ onTitleChange, onEditor }: { onTitleChange(t: string): void; onEditor(e: unknown): void }) => {
    useEffect(() => onEditor(fakeEditor), [onEditor]);
    return <input aria-label="Título da palavra" onChange={(e) => onTitleChange(e.target.value)} />;
  },
}));
vi.mock("../editor/SermonToolbar", () => ({ SermonToolbar: () => <div role="toolbar" /> }));

const sermon = {
  id: "s1",
  title: "T",
  baseReference: null,
  pointCount: 0,
  estimatedSeconds: 0,
  status: "DRAFT",
  delivery: null,
  updatedAt: "",
  document: EMPTY_DOC,
  revision: 1,
};

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/palavras/s1"]}>
        <Routes>
          <Route path="/palavras/:id" element={<SermonEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SermonEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.canEdit = true;
  });

  it("404 mostra Palavra não encontrada", async () => {
    api.getSermon.mockRejectedValue({ response: { status: 404 } });
    renderPage();
    expect(await screen.findByText("Palavra não encontrada.")).toBeInTheDocument();
  });

  it("Duplicar depois de um salvamento que falhou não duplica", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.updateSermon.mockRejectedValue(new Error("rede"));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Novo" } });
    const trigger = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicar" }));
    await waitFor(() => expect(api.updateSermon).toHaveBeenCalled());
    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
    expect(api.duplicateSermon).not.toHaveBeenCalled();
  });

  it("sem permissão de edição não há barra de ferramentas", async () => {
    perms.canEdit = false;
    api.getSermon.mockResolvedValue(sermon);
    renderPage();
    await screen.findByLabelText("Título da palavra");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("rascunho mostra Enviar para um culto; palavra enviada mostra o culto", async () => {
    api.getSermon.mockResolvedValue(sermon);
    const first = renderPage();
    expect(await screen.findByRole("button", { name: "Enviar para um culto" })).toBeInTheDocument();
    first.unmount();
    api.getSermon.mockResolvedValue({
      ...sermon,
      status: "SENT",
      delivery: { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" },
    });
    renderPage();
    expect(await screen.findByRole("button", { name: "Enviada · dom 22/11, 19h" })).toBeInTheDocument();
  });

  it("com texto que não salvou, o envio não sai", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.updateSermon.mockRejectedValue(new Error("rede"));
    api.listServiceOptions.mockResolvedValue([
      { id: "c1", date: "2026-11-22", startTime: "19:00", name: "Culto", hasSermon: false, isMine: false },
    ]);
    renderPage();
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar para um culto" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Domingo, 22\/11/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(api.updateSermon).toHaveBeenCalled());
    await screen.findByText("Não foi possível salvar.");
    expect(api.sendSermon).not.toHaveBeenCalled();
  });
});
