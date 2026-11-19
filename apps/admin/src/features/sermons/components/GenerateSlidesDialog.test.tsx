import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOC, type SermonDoc } from "../lib/document";
import { EXAMPLE_DOC } from "../lib/sermon-example";
import { GenerateSlidesDialog } from "./GenerateSlidesDialog";

const api = vi.hoisted(() => ({ generateSlides: vi.fn(), getSermonAi: vi.fn() }));
vi.mock("../api/sermons-api", () => api);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function renderDialog(
  over: {
    document?: SermonDoc;
    title?: string;
    ensureSaved?: () => Promise<boolean>;
    style?: "MINIMAL" | "BACKGROUND";
    notice?: string;
    mode?: "VERSES" | "VERSES_AND_POINTS" | "FULL";
  } = {},
) {
  const onGenerated = vi.fn();
  const onOpenChange = vi.fn();
  const ensureSaved = over.ensureSaved ?? vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GenerateSlidesDialog
        open
        onOpenChange={onOpenChange}
        sermonId="s1"
        title={over.title ?? "Luz"}
        document={over.document ?? EXAMPLE_DOC}
        initialStyle={over.style ?? "MINIMAL"}
        ensureSaved={ensureSaved}
        onGenerated={onGenerated}
        notice={over.notice}
        initialMode={over.mode}
      />
    </QueryClientProvider>,
  );
  return { onGenerated, onOpenChange, ensureSaved };
}

/** Montar só liga depois que a consulta da IA volta. */
async function clickMontar() {
  const button = screen.getByRole("button", { name: "Montar" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("GenerateSlidesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSermonAi.mockResolvedValue({ enabled: false, models: [] });
  });

  it("Gerar de novo: mostra o aviso e começa no modo atual", () => {
    renderDialog({ notice: "Trocar o que mostrar refaz a sequência do zero.", mode: "VERSES" });
    expect(screen.getByText("Trocar o que mostrar refaz a sequência do zero.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Só versículos/ })).toBeChecked();
  });

  it("enquanto monta, o diálogo não fecha e Cancelar fica desligado", async () => {
    let finish!: (v: unknown) => void;
    api.generateSlides.mockReturnValue(new Promise((res) => (finish = res)));
    const { onOpenChange, onGenerated } = renderDialog();
    await clickMontar();
    await waitFor(() => expect(api.generateSlides).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    finish({ id: "s1", slides: [] });
    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("o visual gravado mudar com o diálogo aberto não desfaz a escolha", () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      sermonId: "s1",
      title: "Luz",
      document: EXAMPLE_DOC,
      ensureSaved: vi.fn().mockResolvedValue(true),
      onGenerated: vi.fn(),
    };
    const client = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <GenerateSlidesDialog {...props} initialStyle="MINIMAL" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Só versículos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Verde profundo/ }));
    rerender(
      <QueryClientProvider client={client}>
        <GenerateSlidesDialog {...props} initialStyle="MINIMAL" initialMode="VERSES_AND_POINTS" />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={client}>
        <GenerateSlidesDialog {...props} initialStyle="BACKGROUND" initialMode="VERSES" />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={client}>
        <GenerateSlidesDialog {...props} initialStyle="MINIMAL" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("radio", { name: /Só versículos/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Verde profundo/ })).toBeChecked();
  });

  it("sem aviso, o texto não aparece", () => {
    renderDialog();
    expect(screen.queryByText(/refaz a sequência/)).not.toBeInTheDocument();
  });

  it("mostra as contagens e deixa Slides completos desligado com em breve", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Gerar slides" })).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "O que mostrar" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Só versículos/ })).toHaveTextContent("2 slides");
    expect(screen.getByRole("radio", { name: /Versículos e pontos/ })).toHaveTextContent("5 slides");
    const full = screen.getByRole("radio", { name: /Slides completos/ });
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent("em breve");
    expect(full).not.toHaveTextContent(/\d slides?/);
  });

  it("padrão em Versículos e pontos e no visual já gravado", () => {
    renderDialog({ style: "BACKGROUND" });
    expect(screen.getByRole("radio", { name: /Versículos e pontos/ })).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Visual do slide" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Verde profundo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Azul institucional/ })).not.toBeChecked();
  });

  it("Montar chama generateSlides com o modo e o visual e devolve a palavra", async () => {
    const generated = { id: "s1", slides: [] };
    api.generateSlides.mockResolvedValue(generated);
    const { onGenerated, ensureSaved } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Só versículos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Verde profundo/ }));
    await clickMontar();
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(generated));
    expect(ensureSaved).toHaveBeenCalled();
    expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "VERSES", style: "BACKGROUND" });
  });

  it("não chama a API quando o salvamento falha", async () => {
    const { onGenerated } = renderDialog({ ensureSaved: vi.fn().mockResolvedValue(false) });
    await clickMontar();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Salve a palavra antes de montar os slides."));
    expect(api.generateSlides).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("erro da API vira aviso e não fecha", async () => {
    api.generateSlides.mockRejectedValue(new Error("rede"));
    const { onGenerated } = renderDialog();
    await clickMontar();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("com 0 slides o Montar fica desligado e explica", () => {
    renderDialog({ document: EMPTY_DOC, title: "" });
    expect(screen.getByRole("button", { name: "Montar" })).toBeDisabled();
    expect(screen.getByText("Escreva um versículo ou um ponto para montar os slides.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Só versículos/ })).toHaveTextContent("0 slides");
  });

  it("singular: 1 slide", () => {
    renderDialog({ document: { type: "doc", content: [{ type: "point", attrs: { id: "p" }, content: [{ type: "text", text: "x" }] }] }, title: "" });
    expect(screen.getByRole("radio", { name: /Versículos e pontos/ })).toHaveTextContent("1 slide");
    expect(screen.getByRole("radio", { name: /Versículos e pontos/ })).not.toHaveTextContent("1 slides");
  });

  describe("com IA ligada", () => {
    const MODEL_A = { id: "claude-opus-5-5", label: "Claude Opus 5.5" };
    const MODEL_B = { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" };
    const enable = (models = [MODEL_A]) => api.getSermonAi.mockResolvedValue({ enabled: true, models });
    const apiError = (status: number, message: string) =>
      new AxiosError("falhou", "ERR_BAD_RESPONSE", undefined, undefined, {
        status,
        data: { message },
        statusText: "",
        headers: {},
        config: { headers: {} } as never,
      });

    it("consulta falhou: tudo como hoje, Slides completos desligado com em breve", async () => {
      api.getSermonAi.mockRejectedValue(new Error("rede"));
      renderDialog();
      await waitFor(() => expect(api.getSermonAi).toHaveBeenCalled());
      const full = screen.getByRole("radio", { name: /Slides completos/ });
      expect(full).toBeDisabled();
      expect(full).toHaveTextContent("em breve");
    });

    it("opção habilitada, com a descrição e a contagem; o aviso aparece ao selecionar", async () => {
      enable();
      renderDialog();
      const full = await waitFor(() => {
        const r = screen.getByRole("radio", { name: /Slides completos/ });
        expect(r).toBeEnabled();
        return r;
      });
      expect(full).toHaveTextContent("Cada parte resumida numa frase por IA");
      expect(full).toHaveTextContent("8 slides");
      expect(full).not.toHaveTextContent("em breve");
      expect(screen.queryByText(/enviado ao provedor de IA/)).not.toBeInTheDocument();
      fireEvent.click(full);
      expect(
        screen.getByText("O texto da palavra é enviado ao provedor de IA para gerar os resumos. As anotações “Só para mim” nunca são enviadas."),
      ).toBeInTheDocument();
    });

    it("dois modelos: seletor com o primeiro escolhido, e Montar manda o model escolhido", async () => {
      enable([MODEL_A, MODEL_B]);
      api.generateSlides.mockResolvedValue({ id: "s1", slides: [] });
      const { onGenerated } = renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      const select = screen.getByLabelText("Modelo de IA") as HTMLSelectElement;
      expect(select.value).toBe(MODEL_A.id);
      expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([MODEL_A.label, MODEL_B.label]);
      fireEvent.change(select, { target: { value: MODEL_B.id } });
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      await waitFor(() => expect(onGenerated).toHaveBeenCalled());
      expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "FULL", style: "MINIMAL", model: MODEL_B.id });
    });

    it("um modelo: sem seletor e sem model no corpo", async () => {
      enable([MODEL_A]);
      api.generateSlides.mockResolvedValue({ id: "s1", slides: [] });
      const { onGenerated } = renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      expect(screen.queryByLabelText("Modelo de IA")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      await waitFor(() => expect(onGenerated).toHaveBeenCalled());
      expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "FULL", style: "MINIMAL" });
    });

    it("erro da API mostra a mensagem dela num alerta e mantém o diálogo aberto", async () => {
      enable();
      api.generateSlides.mockRejectedValue(apiError(422, "O modelo não pôde resumir esta palavra. Use “Versículos e pontos”."));
      const { onGenerated, onOpenChange } = renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("O modelo não pôde resumir esta palavra. Use “Versículos e pontos”.");
      expect(onGenerated).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(screen.getByRole("button", { name: "Montar" })).toBeEnabled();
    });

    it("limite por hora (429) mostra a mensagem da API", async () => {
      enable();
      api.generateSlides.mockRejectedValue(apiError(429, "Você gerou slides completos muitas vezes na última hora. Tente de novo mais tarde."));
      renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Você gerou slides completos muitas vezes na última hora. Tente de novo mais tarde.");
    });

    it("erro sem mensagem na resposta mostra o texto padrão", async () => {
      enable();
      api.generateSlides.mockRejectedValue(new Error("rede"));
      renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar os slides.");
    });

    it("durante a espera o botão diz Resumindo… e o diálogo não fecha", async () => {
      enable();
      let finish!: (v: unknown) => void;
      api.generateSlides.mockReturnValue(new Promise((res) => (finish = res)));
      const { onOpenChange, onGenerated } = renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      const busy = await screen.findByRole("button", { name: "Resumindo…" });
      expect(busy).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      finish({ id: "s1", slides: [] });
      await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    });

    it("Montar fica desligado enquanto a consulta da IA não volta", async () => {
      let answer!: (v: unknown) => void;
      api.getSermonAi.mockReturnValue(new Promise((res) => (answer = res)));
      api.generateSlides.mockResolvedValue({ id: "s1", slides: [] });
      renderDialog({ mode: "FULL" });
      expect(screen.getByRole("button", { name: "Montar" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      expect(api.generateSlides).not.toHaveBeenCalled();
      answer({ enabled: true, models: [MODEL_A] });
      await waitFor(() => expect(screen.getByRole("radio", { name: /Slides completos/ })).toBeChecked());
      expect(screen.getByRole("button", { name: "Montar" })).toBeEnabled();
    });

    it("429 do limitador geral (ThrottlerException) vira texto em português", async () => {
      enable();
      api.generateSlides.mockRejectedValue(apiError(429, "ThrottlerException: Too Many Requests"));
      renderDialog();
      fireEvent.click(await screen.findByRole("radio", { name: /Slides completos/ }));
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.");
    });

    it("fora de Slides completos, 409 e 503 mostram a mensagem da API no aviso", async () => {
      enable();
      api.generateSlides.mockRejectedValueOnce(apiError(409, "A palavra mudou enquanto os slides eram gerados. Gere de novo."));
      renderDialog();
      await waitFor(() => expect(screen.getByRole("radio", { name: /Slides completos/ })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A palavra mudou enquanto os slides eram gerados. Gere de novo."));
      api.generateSlides.mockRejectedValueOnce(apiError(503, "O modelo configurado não aceitou o pedido. Avise o administrador."));
      fireEvent.click(screen.getByRole("button", { name: "Montar" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O modelo configurado não aceitou o pedido. Avise o administrador."));
    });

    it("palavra já em Slides completos abre nele quando a IA está ligada", async () => {
      enable();
      renderDialog({ mode: "FULL" });
      await waitFor(() => expect(screen.getByRole("radio", { name: /Slides completos/ })).toBeChecked());
    });
  });
});
