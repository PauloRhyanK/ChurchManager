import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlideItem } from "../lib/slides";
import { EMPTY_DOC } from "../lib/document";
import SermonSlidesPage from "./SermonSlidesPage";

const api = vi.hoisted(() => ({
  getSermon: vi.fn(),
  saveSlides: vi.fn(),
  generateSlides: vi.fn(),
  listServiceOptions: vi.fn(),
  previewDelivery: vi.fn(),
  sendSermon: vi.fn(),
  cancelDelivery: vi.fn(),
  listBibleTranslations: vi.fn(),
}));
vi.mock("../api/sermons-api", () => api);
// As imagens da Ponte (canvas e envio) ficam de fora: só o gatilho e o status são conferidos aqui.
const images = vi.hoisted(() => ({ syncDeliveryImages: vi.fn() }));
vi.mock("../lib/delivery-images", () => images);
const perms = vi.hoisted(() => ({ canEdit: true }));
vi.mock("@/features/access/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => perms.canEdit }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// O arrasto não é simulado: um botão de teste chama o mesmo onMove que a alça chamaria.
vi.mock("../components/SlideList", async (importOriginal) => {
  const real = await importOriginal<typeof import("../components/SlideList")>();
  return {
    SlideList: (props: Parameters<typeof real.SlideList>[0]) => (
      <>
        <real.SlideList {...props} />
        <button type="button" onClick={() => props.onMove("p1:0", "title")}>
          mover ponto para o topo
        </button>
      </>
    ),
  };
});

const NEW_FIELDS = { layout: "TITLE", heading: null, items: null, start: null, version: null } as const;
const SLIDES: SlideItem[] = [
  { id: "title", kind: "TITLE", sourceBlockId: null, text: "Luz que não se apaga", reference: null, included: true, edited: false, ...NEW_FIELDS },
  { id: "v1:0", kind: "VERSE", sourceBlockId: "v1", text: "Eu sou a luz do mundo", reference: "João 8:12", included: true, edited: false, ...NEW_FIELDS, layout: "VERSE", heading: "1. A luz chama" },
  { id: "p1:0", kind: "POINT", sourceBlockId: "p1", text: "A luz chama", reference: null, included: true, edited: false, ...NEW_FIELDS },
  { id: "n1:0", kind: "PRIVATE", sourceBlockId: "n1", text: "História da lanterna", reference: null, included: false, edited: false, ...NEW_FIELDS },
];

function sermon(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    title: "Luz que não se apaga",
    baseReference: null,
    pointCount: 1,
    estimatedSeconds: 0,
    status: "DRAFT",
    delivery: null,
    slideCount: 3,
    updatedAt: "",
    document: EMPTY_DOC,
    revision: 1,
    slideMode: "VERSES_AND_POINTS",
    slideStyle: "MINIMAL",
    slides: SLIDES,
    slidesStale: false,
    ...over,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/palavras/s1/slides"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/palavras/:id/slides" element={<SermonSlidesPage />} />
          <Route path="/palavras/:id" element={<p>Esboço aberto</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const cards = () => within(screen.getByRole("region", { name: "No telão" })).queryAllByTestId("slide-card");
const lastBody = () => api.saveSlides.mock.calls.at(-1)![1];
/** Deixa a resposta do salvamento chegar antes do fim do teste. */
const settle = () => act(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  perms.canEdit = true;
  api.getSermon.mockResolvedValue(sermon());
  api.listServiceOptions.mockResolvedValue([]);
  api.listBibleTranslations.mockResolvedValue([]);
  images.syncDeliveryImages.mockResolvedValue({ total: 0, missing: 0, uploaded: 0, failed: 0 });
});

describe("SermonSlidesPage", () => {
  it("Exportar abre o diálogo com os slides que a pessoa vê", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Exportar" }));
    expect(await screen.findByRole("heading", { name: "Exportar" })).toBeInTheDocument();
    expect(screen.getByText("3 slides, nas cores escolhidas")).toBeInTheDocument();
  });

  it("Exportar fica desligado enquanto a lista está travada (atualizando)", async () => {
    const regenerating = deferred<unknown>();
    api.getSermon.mockResolvedValue(sermon({ slidesStale: true }));
    api.generateSlides.mockReturnValue(regenerating.promise);
    renderPage();
    expect(await screen.findByRole("button", { name: "Exportar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled());
    await act(async () => regenerating.resolve(sermon()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled());
  });

  it("Exportar espera a fila e não abre se o salvamento falhou", async () => {
    const failing = deferred<unknown>();
    api.saveSlides.mockReturnValueOnce(failing.promise);
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    await act(async () => failing.reject(new Error("falhou")));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar os slides. Confira a lista antes de exportar."),
    );
    expect(screen.queryByRole("heading", { name: "Exportar" })).not.toBeInTheDocument();
  });

  it("mostra a lista, a contagem dos marcados e a prévia só com os públicos marcados", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Luz que não se apaga", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Tirado do esboço")).toBeInTheDocument();
    expect(screen.getByText("· 3 slides")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tirado do esboço" })).getByText("João 8:12")).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
    expect(cards().map((c) => c.textContent)).not.toContain("História da lanterna");
    expect(screen.getByRole("link", { name: "Voltar para o esboço" })).toHaveAttribute("href", "/palavras/s1");
  });

  it("desmarcar salva a lista inteira com o item desmarcado e o privado desmarcado", async () => {
    api.saveSlides.mockImplementation(async (_id, body) =>
      sermon({ slides: SLIDES.map((s) => ({ ...s, included: body.items.find((i: { id: string }) => i.id === s.id).included })) }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    expect(api.saveSlides).toHaveBeenCalledWith("s1", {
      style: "MINIMAL",
      items: [
        { id: "title", included: true },
        { id: "v1:0", included: false },
        { id: "p1:0", included: true },
        { id: "n1:0", included: false },
      ],
    });
    expect(screen.getByText("· 2 slides")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
    await waitFor(() => expect(box(/João 8:12/)).not.toBeChecked());
  });

  it("item privado tem a caixa desligada", async () => {
    renderPage();
    const privateBox = await screen.findByRole("checkbox", { name: /História da lanterna/ });
    expect(privateBox).toBeDisabled();
    expect(privateBox).not.toBeChecked();
  });

  it("reordenar manda a nova ordem", async () => {
    api.saveSlides.mockResolvedValue(sermon());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "mover ponto para o topo" }));
    expect(lastBody().items.map((i: { id: string }) => i.id)).toEqual(["p1:0", "title", "v1:0", "n1:0"]);
    expect(within(screen.getByRole("region", { name: "No telão" })).getAllByTestId("slide-card")[0]).toHaveTextContent("A luz chama");
    await settle();
  });

  it("editar o texto de um ponto manda text", async () => {
    api.saveSlides.mockResolvedValue(sermon());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "A luz chama" }));
    const input = screen.getByLabelText("Texto do slide");
    fireEvent.change(input, { target: { value: "A luz convida" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(lastBody().items[2]).toEqual({ id: "p1:0", included: true, text: "A luz convida" });
    await settle();
  });

  it("um salvamento por vez; o último estado vence e a resposta antiga não desfaz a tela", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    api.saveSlides.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    fireEvent.click(box(/Luz que não se apaga/));
    expect(api.saveSlides).toHaveBeenCalledTimes(1);
    // A primeira resposta (só o versículo desmarcado) chega com outra mudança ainda por salvar.
    await act(async () => first.resolve(sermon({ slides: SLIDES.map((s) => (s.id === "v1:0" ? { ...s, included: false } : s)) })));
    expect(box(/Luz que não se apaga/)).not.toBeChecked();
    expect(api.saveSlides).toHaveBeenCalledTimes(2);
    expect(lastBody().items.slice(0, 2)).toEqual([
      { id: "title", included: false },
      { id: "v1:0", included: false },
    ]);
    await act(async () => second.resolve(sermon({ slides: SLIDES.map((s) => (s.id === "n1:0" || s.id === "p1:0" ? s : { ...s, included: false })) })));
    expect(box(/Luz que não se apaga/)).not.toBeChecked();
    expect(screen.getByText("· 1 slide")).toBeInTheDocument();
  });

  it("erro ao salvar volta ao estado do servidor e avisa", async () => {
    api.saveSlides.mockRejectedValue(new Error("falhou"));
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar os slides."));
    expect(api.getSermon).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(box(/João 8:12/)).toBeChecked());
  });

  it("trocar o visual salva o estilo", async () => {
    api.saveSlides.mockResolvedValue(sermon({ slideStyle: "BACKGROUND" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Verde · trocar" }));
    expect(lastBody().style).toBe("BACKGROUND");
    expect(await screen.findByRole("button", { name: "Azul-marinho · trocar" })).toBeInTheDocument();
  });

  it("esboço alterado: aviso e Atualizar gera com o modo atual", async () => {
    api.getSermon.mockResolvedValue(sermon({ slidesStale: true, slideMode: "TITLES" }));
    api.generateSlides.mockResolvedValue(sermon({ slidesStale: false, slideMode: "TITLES" }));
    renderPage();
    expect(await screen.findByText("O esboço mudou depois destes slides.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "TITLES" }));
    await waitFor(() => expect(screen.queryByText("O esboço mudou depois destes slides.")).not.toBeInTheDocument());
  });

  it("Atualizar com erro do servidor mostra a mensagem da API", async () => {
    api.getSermon.mockResolvedValue(sermon({ slidesStale: true, slideMode: "VERSES_AND_POINTS" }));
    api.generateSlides.mockRejectedValue(
      new AxiosError("Request failed with status code 503", "ERR_BAD_RESPONSE", undefined, undefined, {
        status: 503,
        data: { message: "O modelo configurado não aceitou o pedido. Avise o administrador." },
        statusText: "",
        headers: {},
        config: { headers: {} } as never,
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O modelo configurado não aceitou o pedido. Avise o administrador."));
  });

  it("Atualizar com um modo antigo gravado gera em Com versículos e trava o botão enquanto gera", async () => {
    api.getSermon.mockResolvedValue(sermon({ slidesStale: true, slideMode: "FULL" }));
    const gen = deferred<ReturnType<typeof sermon>>();
    api.generateSlides.mockReturnValue(gen.promise);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar" }));
    expect(await screen.findByRole("button", { name: "Atualizar" })).toBeDisabled();
    expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "VERSES_AND_POINTS" });
    gen.resolve(sermon({ slidesStale: false, slideMode: "VERSES_AND_POINTS" }));
    await waitFor(() => expect(screen.queryByText("O esboço mudou depois destes slides.")).not.toBeInTheDocument());
  });

  it("sem aviso quando os slides estão em dia", async () => {
    renderPage();
    await screen.findByText("Tirado do esboço");
    expect(screen.queryByText("O esboço mudou depois destes slides.")).not.toBeInTheDocument();
  });

  it("Gerar de novo abre o diálogo com o aviso", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Gerar de novo" }));
    expect(await screen.findByText("Trocar o que mostrar refaz a sequência do zero.")).toBeInTheDocument();
  });

  it("sem slides mostra o estado vazio com Gerar slides", async () => {
    api.getSermon.mockResolvedValue(sermon({ slides: [], slideMode: null, slideCount: 0 }));
    renderPage();
    expect(await screen.findByText("Esta palavra ainda não tem slides.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar slides" }));
    expect(await screen.findByRole("dialog", { name: "Gerar slides" })).toBeInTheDocument();
    expect(screen.queryByText(/refaz a sequência/)).not.toBeInTheDocument();
  });

  it("vindo do esboço com cache novo (staleTime do app): abre na hora e atualiza com a busca", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    client.setQueryData(["sermons", "detail", "s1"], sermon());
    const fresh = deferred<unknown>();
    api.getSermon.mockReturnValue(fresh.promise);
    renderPage(client);
    expect(await screen.findByRole("heading", { name: "Luz que não se apaga", level: 1 })).toBeInTheDocument();
    expect(box(/João 8:12/)).toBeChecked();
    expect(api.getSermon).toHaveBeenCalledWith("s1");
    await act(async () => fresh.resolve(sermon({ slides: SLIDES.map((s) => (s.id === "v1:0" ? { ...s, included: false } : s)) })));
    await waitFor(() => expect(box(/João 8:12/)).not.toBeChecked());
  });

  const chooseAndSend = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar para um culto" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Culto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  };
  const OPTION = [{ id: "c1", date: "2026-11-22", startTime: "19:00", name: "Culto", hasSermon: false, isMine: false }];

  it("envio pedido enquanto um salvamento falha não segue e avisa", async () => {
    const failing = deferred<unknown>();
    api.saveSlides.mockReturnValueOnce(failing.promise);
    api.sendSermon.mockResolvedValue(sermon());
    api.listServiceOptions.mockResolvedValue(OPTION);
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    await chooseAndSend();
    await act(async () => failing.reject(new Error("falhou")));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar os slides. Confira a lista antes de enviar."),
    );
    expect(api.sendSermon).not.toHaveBeenCalled();
  });

  it("depois que a lista volta ao estado do servidor, o envio segue sem precisar mexer em nada", async () => {
    api.saveSlides.mockRejectedValue(new Error("falhou"));
    api.sendSermon.mockResolvedValue(sermon());
    api.listServiceOptions.mockResolvedValue(OPTION);
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar os slides."));
    await waitFor(() => expect(box(/João 8:12/)).not.toBeDisabled());
    await chooseAndSend();
    await waitFor(() => expect(api.sendSermon).toHaveBeenCalled());
  });

  it("se nem a volta ao servidor dá certo, avisa para atualizar e nada segue até um salvamento bom", async () => {
    api.getSermon.mockResolvedValueOnce(sermon({ slidesStale: true })).mockRejectedValue(new Error("rede"));
    api.saveSlides.mockRejectedValueOnce(new Error("falhou")).mockResolvedValue(sermon({ slidesStale: true }));
    api.generateSlides.mockResolvedValue(sermon());
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível carregar os slides. Atualize a página."));
    await waitFor(() => expect(box(/João 8:12/)).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar os slides. Confira a lista antes de enviar."),
    );
    expect(api.generateSlides).not.toHaveBeenCalled();
    fireEvent.click(box(/A luz chama/));
    await waitFor(() => expect(api.saveSlides).toHaveBeenCalledTimes(2));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(api.generateSlides).toHaveBeenCalled());
  });

  it("a busca da montagem que chega atrasada não desfaz uma mudança local", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    client.setQueryData(["sermons", "detail", "s1"], sermon());
    const late = deferred<unknown>();
    api.getSermon.mockReturnValue(late.promise);
    api.saveSlides.mockResolvedValue(sermon({ slides: SLIDES.map((s) => (s.id === "v1:0" ? { ...s, included: false } : s)) }));
    renderPage(client);
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    await settle();
    expect(box(/João 8:12/)).not.toBeChecked();
    await act(async () => late.resolve(sermon()));
    await settle();
    expect(box(/João 8:12/)).not.toBeChecked();
  });

  it("palavra pregada: só leitura, com o aviso", async () => {
    api.getSermon.mockResolvedValue(
      sermon({
        status: "PREACHED",
        slidesStale: true,
        delivery: { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" },
      }),
    );
    renderPage();
    expect(await screen.findByText("Esta palavra já foi pregada. Os slides ficam como foram ao culto.")).toBeInTheDocument();
    for (const b of screen.getAllByRole("checkbox")) expect(b).toBeDisabled();
    expect(screen.queryByLabelText("Arrastar para mudar a ordem")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A luz chama" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar de novo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atualizar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /trocar/ })).not.toBeInTheDocument();
  });

  it("a lista fica travada enquanto volta ao estado do servidor depois de um erro", async () => {
    const reset = deferred<unknown>();
    api.saveSlides.mockRejectedValue(new Error("falhou"));
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /João 8:12/ }));
    api.getSermon.mockReturnValue(reset.promise);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(box(/Luz que não se apaga/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verde · trocar" })).toBeDisabled();
    await act(async () => reset.resolve(sermon()));
    expect(box(/Luz que não se apaga/)).not.toBeDisabled();
    expect(api.saveSlides).toHaveBeenCalledTimes(1);
  });

  it("palavra inexistente ou de outro autor: Palavra não encontrada.", async () => {
    api.getSermon.mockRejectedValue(Object.assign(new Error("404"), { response: { status: 404 } }));
    renderPage();
    expect(await screen.findByText("Palavra não encontrada.")).toBeInTheDocument();
  });

  it("Enviar para um culto abre o diálogo com título e contagem", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Enviar para um culto" }));
    const dialog = await screen.findByRole("dialog", { name: "Enviar para um culto" });
    expect(within(dialog).getByText("Luz que não se apaga · 3 slides")).toBeInTheDocument();
  });

  it("palavra enviada mostra a situação e abre o mesmo diálogo", async () => {
    api.getSermon.mockResolvedValue(
      sermon({ status: "SENT", delivery: { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" } }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Enviada · dom 22/11, 19h" }));
    expect(await screen.findByRole("dialog", { name: "Enviar para um culto" })).toBeInTheDocument();
  });

  it("palavra pregada mostra a situação sem diálogo", async () => {
    api.getSermon.mockResolvedValue(
      sermon({ status: "PREACHED", delivery: { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" } }),
    );
    renderPage();
    expect(await screen.findByText("Pregada · dom 22/11")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pregada/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar para um culto" })).not.toBeInTheDocument();
  });

  describe("imagens para a Ponte", () => {
    const SENT = { status: "SENT", delivery: { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" } };

    it("sem envio não gera imagens", async () => {
      renderPage();
      await screen.findByRole("button", { name: "Enviar para um culto" });
      await act(() => new Promise((r) => setTimeout(r, 1700)));
      expect(images.syncDeliveryImages).not.toHaveBeenCalled();
      expect(screen.queryByText(/Imagens para a Ponte/)).not.toBeInTheDocument();
    });

    it("com envio, gera as que faltam e mostra o andamento e o fim", async () => {
      let finish!: (v: unknown) => void;
      images.syncDeliveryImages.mockImplementation((_id: string, onProgress: (p: { done: number; missing: number }) => void) => {
        onProgress({ done: 2, missing: 3 });
        return new Promise((r) => (finish = r));
      });
      api.getSermon.mockResolvedValue(sermon(SENT));
      renderPage();
      expect(await screen.findByText("Imagens para a Ponte: enviando 3 de 3…", undefined, { timeout: 3000 })).toBeInTheDocument();
      expect(images.syncDeliveryImages).toHaveBeenCalledWith("s1", expect.any(Function));
      await act(async () => finish({ total: 3, missing: 3, uploaded: 3, failed: 0 }));
      expect(screen.getByText("Imagens para a Ponte prontas")).toBeInTheDocument();
    });

    it("falha mostra Tentar de novo, que roda outra vez", async () => {
      images.syncDeliveryImages
        .mockResolvedValueOnce({ total: 3, missing: 3, uploaded: 1, failed: 2 })
        .mockResolvedValue({ total: 3, missing: 2, uploaded: 2, failed: 0 });
      api.getSermon.mockResolvedValue(sermon(SENT));
      renderPage();
      expect(await screen.findByText("Imagens para a Ponte: falhou", undefined, { timeout: 3000 })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
      expect(await screen.findByText("Imagens para a Ponte prontas")).toBeInTheDocument();
      expect(images.syncDeliveryImages).toHaveBeenCalledTimes(2);
    });

    it("salvar os slides de uma palavra enviada confere as imagens de novo", async () => {
      images.syncDeliveryImages.mockResolvedValue({ total: 3, missing: 0, uploaded: 0, failed: 0 });
      api.getSermon.mockResolvedValue(sermon({ ...SENT, updatedAt: "2026-11-19T10:00:00.000Z" }));
      api.saveSlides.mockResolvedValue(sermon({ ...SENT, updatedAt: "2026-11-19T10:05:00.000Z" }));
      renderPage();
      await waitFor(() => expect(images.syncDeliveryImages).toHaveBeenCalledTimes(1), { timeout: 3000 });
      fireEvent.click(screen.getByRole("checkbox", { name: /João 8:12/ }));
      await waitFor(() => expect(api.saveSlides).toHaveBeenCalled());
      await waitFor(() => expect(images.syncDeliveryImages).toHaveBeenCalledTimes(2), { timeout: 3000 });
    }, 10_000);
  });
});
