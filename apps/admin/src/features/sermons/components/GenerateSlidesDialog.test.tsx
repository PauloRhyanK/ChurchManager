import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOC, type SermonDoc } from "../lib/document";
import { EXAMPLE_DOC } from "../lib/sermon-example";
import { GenerateSlidesDialog } from "./GenerateSlidesDialog";

const api = vi.hoisted(() => ({ generateSlides: vi.fn() }));
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
    mode?: "VERSES" | "VERSES_AND_POINTS";
  } = {},
) {
  const onGenerated = vi.fn();
  const onOpenChange = vi.fn();
  const ensureSaved = over.ensureSaved ?? vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={new QueryClient()}>
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

describe("GenerateSlidesDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Gerar de novo: mostra o aviso e começa no modo atual", () => {
    renderDialog({ notice: "Trocar o que mostrar refaz a sequência do zero.", mode: "VERSES" });
    expect(screen.getByText("Trocar o que mostrar refaz a sequência do zero.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Só versículos/ })).toBeChecked();
  });

  it("enquanto monta, o diálogo não fecha e Cancelar fica desligado", async () => {
    let finish!: (v: unknown) => void;
    api.generateSlides.mockReturnValue(new Promise((res) => (finish = res)));
    const { onOpenChange, onGenerated } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Montar" }));
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
    fireEvent.click(screen.getByRole("radio", { name: /Com fundo/ }));
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
    expect(screen.getByRole("radio", { name: /Com fundo/ })).toBeChecked();
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
    expect(screen.getByRole("radio", { name: /Com fundo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Minimalista/ })).not.toBeChecked();
  });

  it("Montar chama generateSlides com o modo e o visual e devolve a palavra", async () => {
    const generated = { id: "s1", slides: [] };
    api.generateSlides.mockResolvedValue(generated);
    const { onGenerated, ensureSaved } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Só versículos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Com fundo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Montar" }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(generated));
    expect(ensureSaved).toHaveBeenCalled();
    expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "VERSES", style: "BACKGROUND" });
  });

  it("não chama a API quando o salvamento falha", async () => {
    const { onGenerated } = renderDialog({ ensureSaved: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByRole("button", { name: "Montar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Salve a palavra antes de montar os slides."));
    expect(api.generateSlides).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("erro da API vira aviso e não fecha", async () => {
    api.generateSlides.mockRejectedValue(new Error("rede"));
    const { onGenerated } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Montar" }));
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
});
