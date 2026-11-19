import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOC, type SermonDoc } from "../lib/document";
import { AGENDA_DOC, AGENDA_TITLE, EXAMPLE_DOC } from "../lib/sermon-example";
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
    mode?: "VERSES" | "VERSES_AND_POINTS" | "FULL" | "TITLES";
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

function clickMontar() {
  fireEvent.click(screen.getByRole("button", { name: "Montar" }));
}

describe("GenerateSlidesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Gerar de novo: mostra o aviso e começa no modo atual", () => {
    renderDialog({ notice: "Trocar o que mostrar refaz a sequência do zero.", mode: "TITLES" });
    expect(screen.getByText("Trocar o que mostrar refaz a sequência do zero.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Só títulos/ })).toBeChecked();
  });

  it("modo antigo gravado (Só versículos, Slides completos) abre em Com versículos", () => {
    renderDialog({ mode: "FULL" });
    expect(screen.getByRole("radio", { name: /Com versículos/ })).toBeChecked();
  });

  it("enquanto monta, o diálogo não fecha e Cancelar fica desligado", async () => {
    let finish!: (v: unknown) => void;
    api.generateSlides.mockReturnValue(new Promise((res) => (finish = res)));
    const { onOpenChange, onGenerated } = renderDialog();
    clickMontar();
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
    fireEvent.click(screen.getByRole("radio", { name: /Só títulos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Azul-marinho/ }));
    rerender(
      <QueryClientProvider client={client}>
        <GenerateSlidesDialog {...props} initialStyle="BACKGROUND" initialMode="VERSES_AND_POINTS" />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={client}>
        <GenerateSlidesDialog {...props} initialStyle="MINIMAL" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("radio", { name: /Só títulos/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Azul-marinho/ })).toBeChecked();
  });

  it("sem aviso, o texto não aparece", () => {
    renderDialog();
    expect(screen.queryByText(/refaz a sequência/)).not.toBeInTheDocument();
  });

  it("duas opções com a descrição e a contagem do exemplo aprovado (13 e 9), sem escolha de IA", () => {
    renderDialog({ title: AGENDA_TITLE, document: AGENDA_DOC });
    expect(screen.getByRole("dialog", { name: "Gerar slides" })).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "O que mostrar" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    const verses = screen.getByRole("radio", { name: /Com versículos/ });
    expect(verses).toHaveTextContent("Título, visão geral e o versículo de cada tópico");
    expect(verses).toHaveTextContent("13 slides");
    const titles = screen.getByRole("radio", { name: /Só títulos/ });
    expect(titles).toHaveTextContent("Título, visão geral e o título de cada tópico");
    expect(titles).toHaveTextContent("9 slides");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/em breve/)).not.toBeInTheDocument();
    expect(screen.queryByText(/provedor de IA/)).not.toBeInTheDocument();
  });

  it("padrão em Com versículos e na variação já gravada; as duas variações com as cores", () => {
    renderDialog({ style: "BACKGROUND" });
    expect(screen.getByRole("radio", { name: /Com versículos/ })).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Cores" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Azul-marinho/ })).toBeChecked();
    const green = screen.getByRole("radio", { name: /Verde/ });
    expect(green).not.toBeChecked();
    expect(green.querySelector("[aria-hidden]")).toHaveStyle({ backgroundColor: "#24352F" });
  });

  it("Montar chama generateSlides com o modo e a variação e devolve a palavra", async () => {
    const generated = { id: "s1", slides: [] };
    api.generateSlides.mockResolvedValue(generated);
    const { onGenerated, ensureSaved } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Só títulos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Azul-marinho/ }));
    clickMontar();
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(generated));
    expect(ensureSaved).toHaveBeenCalled();
    expect(api.generateSlides).toHaveBeenCalledWith("s1", { mode: "TITLES", style: "BACKGROUND" });
  });

  it("não chama a API quando o salvamento falha", async () => {
    const { onGenerated } = renderDialog({ ensureSaved: vi.fn().mockResolvedValue(false) });
    clickMontar();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Salve a palavra antes de montar os slides."));
    expect(api.generateSlides).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("erro da API vira aviso e não fecha", async () => {
    api.generateSlides.mockRejectedValue(new Error("rede"));
    const { onGenerated } = renderDialog();
    clickMontar();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível gerar os slides."));
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("com 0 slides o Montar fica desligado e explica", () => {
    renderDialog({ document: EMPTY_DOC, title: "" });
    expect(screen.getByRole("button", { name: "Montar" })).toBeDisabled();
    expect(screen.getByText("Escreva um versículo ou um ponto para montar os slides.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Só títulos/ })).toHaveTextContent("0 slides");
  });

  it("singular: 1 slide", () => {
    renderDialog({ document: { type: "doc", content: [{ type: "point", attrs: { id: "p" }, content: [{ type: "text", text: "x" }] }] }, title: "" });
    expect(screen.getByRole("radio", { name: /Com versículos/ })).toHaveTextContent("1 slide");
    expect(screen.getByRole("radio", { name: /Com versículos/ })).not.toHaveTextContent("1 slides");
  });
});
