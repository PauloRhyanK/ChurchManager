import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOC } from "../lib/document";
import { EXAMPLE_DOC } from "../lib/sermon-example";
import type { SlideItem } from "../lib/slides";
import { ExportDialog } from "./ExportDialog";

const api = vi.hoisted(() => ({ listBibleTranslations: vi.fn() }));
vi.mock("../api/sermons-api", () => api);
const print = vi.hoisted(() => ({ printHtml: vi.fn() }));
vi.mock("@/lib/print", async (orig) => ({
  ...(await orig<typeof import("@/lib/print")>()),
  printHtml: print.printHtml,
}));
const pptx = vi.hoisted(() => ({ downloadPptx: vi.fn() }));
vi.mock("../export/slides-pptx", () => pptx);
const text = vi.hoisted(() => ({ downloadText: vi.fn() }));
vi.mock("../export/verses-text", async (orig) => ({
  ...(await orig<typeof import("../export/verses-text")>()),
  downloadText: text.downloadText,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const slide = (id: string, over: Partial<SlideItem> = {}): SlideItem => ({
  id,
  kind: "VERSE",
  sourceBlockId: "v1",
  text: `Texto ${id}`,
  reference: "João 8:12",
  included: true,
  edited: false,
  ...over,
});
const SLIDES = [
  slide("a"),
  slide("b", { included: false }),
  slide("c", { kind: "PRIVATE", included: true }),
  slide("d", { kind: "POINT", reference: null }),
];

function renderDialog(
  over: { slides?: SlideItem[]; document?: typeof EXAMPLE_DOC } = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExportDialog
        open
        onOpenChange={vi.fn()}
        title="A luz do mundo"
        document={over.document ?? EXAMPLE_DOC}
        speech="3 min de fala"
        slides={over.slides ?? SLIDES}
        slideStyle="BACKGROUND"
      />
    </QueryClientProvider>,
  );
}
const row = (badge: string) =>
  screen.getByText(badge).closest("button") as HTMLButtonElement;

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    print.printHtml.mockReturnValue(true);
    pptx.downloadPptx.mockResolvedValue(undefined);
    api.listBibleTranslations.mockResolvedValue([
      {
        code: "BLIVRE",
        name: "Bíblia Livre",
        shortName: "BLIVRE",
        attribution: "Bíblia Livre (BLIVRE), domínio público",
        license: "",
        isDefault: true,
      },
    ]);
  });

  it("mostra as três opções com as contagens", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Exportar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("O sermão")).toBeInTheDocument();
    expect(
      screen.getByText("O texto inteiro, para imprimir ou ler no tablet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 slides, no visual escolhido"),
    ).toBeInTheDocument();
    expect(screen.getByText("As 2 referências, na ordem")).toBeInTheDocument();
    expect(screen.getByLabelText(/Incluir as anotações/)).not.toBeChecked();
    expect(screen.getByText("Vale só para o PDF.")).toBeInTheDocument();
  });

  it("singular: 1 slide e a referência", () => {
    renderDialog({
      slides: [slide("a")],
      document: { type: "doc", content: [EXAMPLE_DOC.content[0]] },
    });
    expect(
      screen.getByText("1 slide, no visual escolhido"),
    ).toBeInTheDocument();
    expect(screen.getByText("A referência, na ordem")).toBeInTheDocument();
  });

  it("desliga PPT sem slides e TXT sem versículos", () => {
    renderDialog({
      slides: [slide("c", { kind: "PRIVATE" })],
      document: EMPTY_DOC,
    });
    expect(row("PPT")).toBeDisabled();
    expect(screen.getByText("Gere os slides primeiro.")).toBeInTheDocument();
    expect(row("TXT")).toBeDisabled();
    expect(
      screen.getByText("Esta palavra ainda não tem versículos."),
    ).toBeInTheDocument();
    expect(row("PDF")).toBeEnabled();
  });

  it("PDF sem a caixa não leva a anotação; com a caixa leva; créditos da tradução entram", async () => {
    renderDialog();
    await waitFor(() => expect(api.listBibleTranslations).toHaveBeenCalled());
    fireEvent.click(row("PDF"));
    const html = print.printHtml.mock.calls[0][0] as string;
    expect(html).not.toContain("Dois minutos nessa história");
    expect(html).toContain("A luz do mundo");
    fireEvent.click(screen.getByLabelText(/Incluir as anotações/));
    fireEvent.click(row("PDF"));
    expect(print.printHtml.mock.calls[1][0]).toContain(
      "Dois minutos nessa história",
    );
  });

  it("crédito: tradução achada usa a atribuição; não achada entra só com o código", async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("O sermão")).toBeInTheDocument(),
    );
    await waitFor(() => expect(api.listBibleTranslations).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(row("PDF"));
    expect(print.printHtml.mock.calls[0][0]).toContain(
      "Bíblia Livre (BLIVRE), domínio público",
    );
  });

  it("pop-up bloqueado mostra o aviso", () => {
    print.printHtml.mockReturnValue(false);
    renderDialog();
    fireEvent.click(row("PDF"));
    expect(toast.error).toHaveBeenCalledWith(
      "Permita janelas pop-up para exportar o PDF.",
    );
  });

  it("PPT chama downloadPptx com nome, título e o deck sem desmarcados e privados", async () => {
    renderDialog();
    fireEvent.click(row("PPT"));
    await waitFor(() => expect(pptx.downloadPptx).toHaveBeenCalled());
    const [fileName, title, deck] = pptx.downloadPptx.mock.calls[0];
    expect(fileName).toBe("a-luz-do-mundo.pptx");
    expect(title).toBe("A luz do mundo");
    expect(deck.map((s: { text: string }) => s.text)).toEqual([
      "Texto a",
      "Texto d",
    ]);
    expect(deck[0].background).toBe("#1E3A8A");
  });

  it("PPT mostra Gerando… enquanto gera e avisa se falhar", async () => {
    let fail!: (e: Error) => void;
    pptx.downloadPptx.mockReturnValue(
      new Promise((_, reject) => (fail = reject)),
    );
    renderDialog();
    fireEvent.click(row("PPT"));
    expect(await screen.findByText("Gerando…")).toBeInTheDocument();
    fail(new Error("x"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível gerar a apresentação.",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Gerando…")).not.toBeInTheDocument(),
    );
  });

  it("TXT chama downloadText com o texto dos versículos, sem anotação", () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText(/Incluir as anotações/));
    fireEvent.click(row("TXT"));
    const [fileName, body] = text.downloadText.mock.calls[0];
    expect(fileName).toBe("a-luz-do-mundo.txt");
    expect(body).toContain("João 8:12");
    expect(body).not.toContain("Dois minutos nessa história");
  });
});
