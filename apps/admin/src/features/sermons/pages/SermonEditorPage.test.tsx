import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOC, type SermonDoc } from "../lib/document";
import SermonEditorPage from "./SermonEditorPage";
import SermonSlidesPage from "./SermonSlidesPage";

const api = vi.hoisted(() => ({
  getSermon: vi.fn(),
  updateSermon: vi.fn(),
  duplicateSermon: vi.fn(),
  deleteSermon: vi.fn(),
  listServiceOptions: vi.fn(),
  previewDelivery: vi.fn(),
  sendSermon: vi.fn(),
  cancelDelivery: vi.fn(),
  generateSlides: vi.fn(),
  saveSlides: vi.fn(),
  listBibleTranslations: vi.fn(),
}));
vi.mock("../api/sermons-api", () => api);
const perms = vi.hoisted(() => ({ canEdit: true }));
vi.mock("@/features/access/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => perms.canEdit }) }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// Tiptap em jsdom não é o alvo aqui: a folha e a barra viram dublês simples.
const fakeEditor = { on() {}, off() {}, state: { selection: { from: 0 }, doc: { forEach() {} } } };
const TYPED: SermonDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Graça" }] }] };
vi.mock("../editor/SermonSheet", () => ({
  SermonSheet: ({
    document,
    onTitleChange,
    onDocumentChange,
    onEditor,
  }: {
    document: SermonDoc;
    onTitleChange(t: string): void;
    onDocumentChange(d: SermonDoc): void;
    onEditor(e: unknown): void;
  }) => {
    useEffect(() => onEditor(fakeEditor), [onEditor]);
    return (
      <>
        <output data-testid="sheet-doc">{JSON.stringify(document)}</output>
        <input aria-label="Título da palavra" onChange={(e) => onTitleChange(e.target.value)} />
        <button type="button" onClick={() => onDocumentChange(TYPED)}>
          Digitar no texto
        </button>
      </>
    );
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
  slideCount: 0,
  updatedAt: "",
  document: EMPTY_DOC,
  revision: 1,
  slideMode: null,
  slideStyle: "MINIMAL",
  slides: [],
  slidesStale: false,
};
const WITH_POINT: SermonDoc = { type: "doc", content: [{ type: "point", attrs: { id: "p0" }, content: [{ type: "text", text: "Graça" }] }] };
const FIVE_SLIDES = Array.from({ length: 5 }, (_, i) => ({
  id: `p${i}:0`,
  kind: "POINT",
  sourceBlockId: `p${i}`,
  text: `Ponto ${i}`,
  reference: null,
  included: true,
  edited: false,
}));

function renderPage(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/palavras/s1"]}>
        <Routes>
          <Route path="/palavras/:id" element={<SermonEditorPage />} />
          <Route path="/palavras/:id/slides" element={<p>Conferência dos slides</p>} />
          <Route path="/palavras" element={<p>Lista de palavras</p>} />
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
  afterEach(() => vi.restoreAllMocks());

  const back = () => fireEvent.click(screen.getByRole("button", { name: "Voltar para Palavras" }));
  const listInvalidated = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.some(([filters]) => JSON.stringify((filters as { queryKey?: unknown })?.queryKey) === '["sermons","list"]');

  it("Exportar abre o diálogo com o título que está na tela", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.listBibleTranslations.mockResolvedValue([]);
    renderPage();
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Título novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(await screen.findByRole("heading", { name: "Exportar" })).toBeInTheDocument();
    expect(screen.getByText("Gere os slides primeiro.")).toBeInTheDocument();
  });

  it("título apagado (ou só espaços) salva como Sem título", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.updateSermon.mockResolvedValue({ ...sermon, revision: 2 });
    for (const value of ["", "   "]) {
      api.updateSermon.mockClear();
      const view = renderPage();
      const input = await screen.findByLabelText("Título da palavra");
      fireEvent.change(input, { target: { value: "x" } });
      fireEvent.change(input, { target: { value } });
      back();
      await waitFor(() => expect(api.updateSermon).toHaveBeenCalledWith("s1", { title: "Sem título" }));
      view.unmount();
    }
  });

  it("voltar para a lista depois de salvar invalida a lista", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.updateSermon.mockResolvedValue({ ...sermon, revision: 2 });
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderPage(client);
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Novo" } });
    back();
    expect(await screen.findByText("Lista de palavras")).toBeInTheDocument();
    expect(api.updateSermon).toHaveBeenCalled();
    expect(listInvalidated(spy)).toBe(true);
  });

  it("apagar e duplicar invalidam a lista", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.deleteSermon.mockResolvedValue(undefined);
    api.duplicateSermon.mockResolvedValue({ ...sermon, id: "s2" });
    for (const action of ["Duplicar", "Apagar"]) {
      const client = new QueryClient();
      const spy = vi.spyOn(client, "invalidateQueries");
      const view = renderPage(client);
      fireEvent.keyDown(await screen.findByRole("button", { name: "Mais ações" }), { key: "Enter" });
      fireEvent.click(await screen.findByRole("menuitem", { name: action }));
      if (action === "Apagar") fireEvent.click(await screen.findByRole("button", { name: "Apagar palavra" }));
      await waitFor(() => expect(listInvalidated(spy)).toBe(true));
      view.unmount();
    }
  });

  it("409 de um envio que o servidor já gravou não vira conflito: segue com a revisão do servidor", async () => {
    // O servidor guarda o JSON com as chaves em outra ordem (jsonb).
    const stored = JSON.parse(JSON.stringify(TYPED), (_k, v) =>
      v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v,
    );
    api.getSermon.mockResolvedValueOnce(sermon).mockResolvedValueOnce({ ...sermon, document: stored, revision: 6 });
    api.updateSermon.mockRejectedValueOnce({ response: { status: 409 } }).mockResolvedValue({ ...sermon, revision: 7 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Digitar no texto" }));
    back();
    expect(await screen.findByText("Lista de palavras")).toBeInTheDocument();
    expect(api.getSermon).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/alterada em outra aba/)).not.toBeInTheDocument();
  });

  it("409 com outro texto no servidor: conflito avisa que Recarregar descarta o que foi escrito", async () => {
    api.getSermon.mockResolvedValueOnce(sermon).mockResolvedValueOnce({ ...sermon, revision: 6 });
    api.updateSermon.mockRejectedValue({ response: { status: 409 } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Digitar no texto" }));
    back();
    expect(
      await screen.findByText(
        "Esta palavra foi alterada em outra aba. Recarregar descarta o que você escreveu aqui desde o último salvamento.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
  });

  it("erro ao salvar mostra a mensagem do status", async () => {
    const cases = [
      [{ response: { status: 413 } }, "A palavra ficou grande demais para salvar."],
      [{ response: { status: 400 } }, "O servidor recusou este conteúdo. Desfaça a última alteração."],
      [new Error("rede"), "Não foi possível salvar."],
    ] as const;
    for (const [error, text] of cases) {
      api.getSermon.mockResolvedValue(sermon);
      api.updateSermon.mockReset().mockRejectedValue(error);
      const view = renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Digitar no texto" }));
      back();
      expect(await screen.findByText(text)).toBeInTheDocument();
      view.unmount();
    }
  });

  it("palavra pregada mostra Pregada no cabeçalho e não abre o envio", async () => {
    api.getSermon.mockResolvedValue({
      ...sermon,
      status: "PREACHED",
      delivery: { date: "2026-11-15", startTime: "19:00", serviceId: "c1", serviceName: "Culto" },
    });
    renderPage();
    const label = await screen.findByText("Pregada · dom 15/11");
    fireEvent.click(label);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar para um culto|Enviada|Gerar slides/ })).not.toBeInTheDocument();
    expect(api.listServiceOptions).not.toHaveBeenCalled();
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

  const SENT_DELIVERY = { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" };
  const WITH_SLIDES = { slideCount: 5, slideMode: "VERSES_AND_POINTS", slides: FIVE_SLIDES };

  it("sem slides: Gerar slides e, ao lado, Enviar para um culto, que abre o envio com o salvamento do editor", async () => {
    api.getSermon.mockResolvedValue(sermon);
    api.listServiceOptions.mockResolvedValue([]);
    api.updateSermon.mockResolvedValue({ ...sermon, revision: 2 });
    renderPage();
    expect(await screen.findByRole("button", { name: "Gerar slides" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar para um culto" }));
    expect(await screen.findByRole("dialog", { name: "Enviar para um culto" })).toBeInTheDocument();
  });

  it("sem slides e enviada: a etiqueta Enviada abre o mesmo envio (mudar ou cancelar)", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, status: "SENT", delivery: SENT_DELIVERY });
    api.listServiceOptions.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Enviada · dom 22/11, 19h" }));
    const dialog = await screen.findByRole("dialog", { name: "Enviar para um culto" });
    expect(dialog).toHaveTextContent("Cancelar o envio");
  });

  it("com slides: Slides · N leva à conferência e não há envio no editor", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, ...WITH_SLIDES });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Slides · 5" }));
    expect(await screen.findByText("Conferência dos slides")).toBeInTheDocument();
  });

  it("com slides e enviada: a etiqueta Enviada leva à conferência", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, ...WITH_SLIDES, status: "SENT", delivery: SENT_DELIVERY });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Enviada · dom 22/11, 19h" }));
    expect(await screen.findByText("Conferência dos slides")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar para um culto" })).not.toBeInTheDocument();
  });

  it("com slides e enviada: a etiqueta Enviada salva antes de ir; se o salvamento falha, fica", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, ...WITH_SLIDES, status: "SENT", delivery: SENT_DELIVERY });
    api.updateSermon.mockRejectedValue(new Error("rede"));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviada · dom 22/11, 19h" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Salve a palavra antes de abrir os slides."));
    expect(screen.queryByText("Conferência dos slides")).not.toBeInTheDocument();
  });

  it("Slides · N salva o que está pendente antes de ir; se o salvamento falha, fica", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, ...WITH_SLIDES });
    api.updateSermon.mockRejectedValueOnce(new Error("rede")).mockResolvedValue({ ...sermon, ...WITH_SLIDES, revision: 2 });
    renderPage();
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Slides · 5" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Salve a palavra antes de abrir os slides."));
    expect(api.updateSermon).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Conferência dos slides")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(api.updateSermon).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Slides · 5" }));
    expect(await screen.findByText("Conferência dos slides")).toBeInTheDocument();
  });

  it("vindo de um cache novo (staleTime do app), o editor ainda busca do servidor antes de abrir", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    client.setQueryData(["sermons", "detail", "s1"], { ...sermon, document: EMPTY_DOC, revision: 1 });
    api.getSermon.mockResolvedValue({ ...sermon, document: TYPED, revision: 4 });
    renderPage(client);
    await waitFor(() => expect(screen.getByTestId("sheet-doc")).toHaveTextContent("Graça"));
    expect(api.getSermon).toHaveBeenCalledTimes(1);
  });

  it("esboço → slides → esboço → digitar → lista → esboço abre o texto e a revisão mais novos", async () => {
    let server: Record<string, unknown> = { ...sermon, ...WITH_SLIDES };
    api.getSermon.mockImplementation(async () => server);
    api.updateSermon.mockImplementation(async (_id: string, body: { title?: string; document?: SermonDoc }) => {
      server = { ...server, ...body, revision: (server.revision as number) + 1 };
      return server;
    });
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/palavras/s1"]}>
          <Routes>
            <Route path="/palavras/:id" element={<SermonEditorPage />} />
            <Route path="/palavras/:id/slides" element={<SermonSlidesPage />} />
            <Route path="/palavras" element={<Link to="/palavras/s1">abrir a palavra</Link>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Slides · 5" }));
    fireEvent.click(await screen.findByRole("link", { name: "Voltar para o esboço" }));
    fireEvent.click(await screen.findByRole("button", { name: "Digitar no texto" }));
    back();
    fireEvent.click(await screen.findByRole("link", { name: "abrir a palavra" }));
    await waitFor(() => expect(screen.getByTestId("sheet-doc")).toHaveTextContent("Graça"));
    expect(api.updateSermon).toHaveBeenCalledWith("s1", { document: TYPED, baseRevision: 1 });
    // Reabrir buscou de novo no servidor e a busca veio depois do salvamento (revisão nova).
    const lastRead = await api.getSermon.mock.results.at(-1)!.value;
    expect(lastRead.revision).toBe(2);
    expect(api.getSermon.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(api.updateSermon.mock.invocationCallOrder[0]);
    // A próxima escrita parte da revisão nova: sem 409.
    fireEvent.change(screen.getByLabelText("Título da palavra"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Digitar no texto" }));
    back();
    await waitFor(() => expect(api.updateSermon).toHaveBeenCalledTimes(2));
    expect(api.updateSermon.mock.calls[1][1]).toMatchObject({ baseRevision: 2 });
  });

  it("Montar salva, gera, atualiza a barra sem remontar o editor e vai para a conferência", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, document: WITH_POINT });
    api.generateSlides.mockResolvedValue({ ...sermon, slideCount: 5, slideMode: "VERSES_AND_POINTS", slides: FIVE_SLIDES, revision: 9 });
    const client = new QueryClient();
    const spy = vi.spyOn(client, "setQueryData");
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: "Gerar slides" }));
    fireEvent.click(await screen.findByRole("button", { name: "Montar" }));
    expect(await screen.findByText("Conferência dos slides")).toBeInTheDocument();
    expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "VERSES_AND_POINTS", style: "MINIMAL" });
    // Na cópia em cache só os slides mudam: texto e revisão ficam como estão.
    const [key, updater] = spy.mock.calls.find(([k]) => JSON.stringify(k) === '["sermons","detail","s1"]')!;
    expect(key).toEqual(["sermons", "detail", "s1"]);
    const next = (updater as (old: unknown) => typeof sermon)({ ...sermon, document: WITH_POINT });
    expect(next.slides).toHaveLength(5);
    expect(next.revision).toBe(1);
    expect(next.document).toBe(WITH_POINT);
  });

  it("com texto que não salvou, os slides não saem", async () => {
    api.getSermon.mockResolvedValue({ ...sermon, document: WITH_POINT });
    api.updateSermon.mockRejectedValue(new Error("rede"));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Título da palavra"), { target: { value: "Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar slides" }));
    fireEvent.click(await screen.findByRole("button", { name: "Montar" }));
    await waitFor(() => expect(api.updateSermon).toHaveBeenCalled());
    await screen.findByText("Não foi possível salvar.");
    expect(api.generateSlides).not.toHaveBeenCalled();
  });
});
