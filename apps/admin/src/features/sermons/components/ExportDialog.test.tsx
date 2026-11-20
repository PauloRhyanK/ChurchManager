import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  layout: "VERSE",
  heading: "1. A luz",
  items: null,
  start: null,
  version: null,
  ...over,
});
const SLIDES = [
  slide("a"),
  slide("b", { included: false }),
  slide("c", { kind: "PRIVATE", included: true, layout: "TITLE", heading: null }),
  slide("d", { kind: "POINT", reference: null, layout: "TITLE", heading: null }),
];

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let now = 1_000_000;
const later = () => (now += 2000);
function renderDialog(
  over: { slides?: SlideItem[]; document?: typeof EXAMPLE_DOC } = {},
) {
  return render(
    <QueryClientProvider client={client}>
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
    client.clear();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    later();
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

  it("mostra as três opções com as contagens", async () => {
    renderDialog();
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    expect(
      screen.getByRole("heading", { name: "Exportar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("O sermão")).toBeInTheDocument();
    expect(
      screen.getByText("O texto inteiro, para imprimir ou ler no tablet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 slides, nas cores escolhidas"),
    ).toBeInTheDocument();
    expect(screen.getByText("As 2 referências, na ordem")).toBeInTheDocument();
    expect(screen.getByLabelText(/Incluir as anotações/)).not.toBeChecked();
    expect(screen.getByText("Vale só para o PDF.")).toBeInTheDocument();
  });

  it("singular: 1 slide e a referência", async () => {
    renderDialog({
      slides: [slide("a")],
      document: { type: "doc", content: [EXAMPLE_DOC.content[0]] },
    });
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    expect(
      screen.getByText("1 slide, nas cores escolhidas"),
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
    later();
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

  it("crédito: tradução que a lista não conhece entra só com o código", async () => {
    api.listBibleTranslations.mockResolvedValue([]);
    renderDialog();
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    fireEvent.click(row("PDF"));
    const html = print.printHtml.mock.calls[0][0] as string;
    expect(html).toContain("BLIVRE");
    expect(html).not.toContain("domínio público");
  });

  it("enquanto a lista de traduções carrega, PDF e TXT ficam desligados com aviso", async () => {
    let finish!: (v: unknown) => void;
    api.listBibleTranslations.mockReturnValue(new Promise((res) => (finish = res)));
    renderDialog();
    expect(screen.getAllByText("Carregando os créditos…")).toHaveLength(2);
    expect(row("PDF")).toBeDisabled();
    expect(row("TXT")).toBeDisabled();
    finish([]);
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    expect(row("TXT")).toBeEnabled();
  });

  it("se a lista de traduções falhar, exporta com o código", async () => {
    api.listBibleTranslations.mockRejectedValue(new Error("x"));
    renderDialog();
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    fireEvent.click(row("TXT"));
    expect(text.downloadText.mock.calls[0][1]).toContain("BLIVRE");
  });

  it("a caixa das anotações volta desmarcada quando o diálogo reabre", async () => {
    const view = renderDialog();
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    fireEvent.click(screen.getByLabelText(/Incluir as anotações/));
    expect(screen.getByLabelText(/Incluir as anotações/)).toBeChecked();
    const again = (open: boolean) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <ExportDialog open={open} onOpenChange={vi.fn()} title="A luz do mundo" document={EXAMPLE_DOC} speech="3 min de fala" slides={SLIDES} slideStyle="BACKGROUND" />
        </QueryClientProvider>,
      );
    again(false);
    again(true);
    expect(screen.getByLabelText(/Incluir as anotações/)).not.toBeChecked();
    fireEvent.click(row("PDF"));
    expect(print.printHtml.mock.calls[0][0]).not.toContain("Dois minutos nessa história");
  });

  it("segundo clique em PDF e TXT em seguida é ignorado", async () => {
    renderDialog();
    await waitFor(() => expect(row("PDF")).toBeEnabled());
    fireEvent.click(row("PDF"));
    fireEvent.click(row("PDF"));
    expect(print.printHtml).toHaveBeenCalledTimes(1);
    fireEvent.click(row("TXT"));
    fireEvent.click(row("TXT"));
    expect(text.downloadText).toHaveBeenCalledTimes(1);
  });

  it("pop-up bloqueado mostra o aviso", async () => {
    print.printHtml.mockReturnValue(false);
    renderDialog();
    await waitFor(() => expect(row("PDF")).toBeEnabled());
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
    const texts = (s: { texts: { lines: { text: string }[][] }[] }) => s.texts.map((t) => t.lines.map((l) => l.map((r) => r.text).join("")).join(" "));
    expect(deck.map(texts)).toEqual([
      ["1. A luz", "“", "Texto a", "João 8:12"],
      ["Texto d"],
    ]);
    expect(deck[0].theme).toMatchObject({ background: "#11223B", text: "#F6F2EA" });
  });

  it("PPT avisa que o computador precisa da Montserrat", () => {
    renderDialog();
    expect(within(row("PPT")).getByText("Para o .pptx ficar igual, instale a fonte Montserrat (Google Fonts) no computador que vai abrir a apresentação.")).toBeInTheDocument();
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

  it("TXT chama downloadText com o texto dos versículos, sem anotação", async () => {
    renderDialog();
    await waitFor(() => expect(row("TXT")).toBeEnabled());
    fireEvent.click(screen.getByLabelText(/Incluir as anotações/));
    fireEvent.click(row("TXT"));
    const [fileName, body] = text.downloadText.mock.calls[0];
    expect(fileName).toBe("a-luz-do-mundo.txt");
    expect(body).toContain("João 8:12");
    expect(body).not.toContain("Dois minutos nessa história");
  });
});
