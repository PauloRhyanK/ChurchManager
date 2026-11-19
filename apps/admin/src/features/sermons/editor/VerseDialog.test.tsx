import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerseAttrs } from "../lib/document";
import { VerseDialog } from "./VerseDialog";

const api = vi.hoisted(() => ({
  listBibleTranslations: vi.fn(),
  searchBible: vi.fn(),
}));
vi.mock("../api/sermons-api", () => api);

const BLIVRE = {
  code: "BLIVRE",
  name: "Bíblia Livre",
  shortName: "BLIVRE",
  attribution: "Bíblia Livre, de Diego Santos e colaboradores",
  license: "CC BY 3.0 BR",
  isDefault: true,
};
const KJA = { ...BLIVRE, code: "KJA", name: "King James Atualizada", shortName: "KJA", license: "Uso permitido", isDefault: false };

const LUZ = "Vós sois a luz do mundo; não se pode esconder uma cidade edificada sobre um monte.";
const CANDEIA = "Nem se acende a candeia e se coloca debaixo do alqueire, mas no velador, e dá luz a todos que estão na casa.";
const BRILHE = "Assim resplandeça a vossa luz diante dos homens.";
const HITS = [
  { reference: "Mateus 5:14", book: 40, chapter: 5, verseStart: 14, verseEnd: 14, translation: "BLIVRE", verses: [{ number: 14, text: LUZ }], hint: null },
  {
    reference: "Mateus 5:14-16",
    book: 40,
    chapter: 5,
    verseStart: 14,
    verseEnd: 16,
    translation: "BLIVRE",
    verses: [
      { number: 14, text: LUZ },
      { number: 15, text: CANDEIA },
      { number: 16, text: BRILHE },
    ],
    hint: "Três versículos · do 14 ao 16",
  },
  { reference: "Mateus 5:15", book: 40, chapter: 5, verseStart: 15, verseEnd: 15, translation: "BLIVRE", verses: [{ number: 15, text: CANDEIA }], hint: null },
];
/** O bloco que o hit vira: o hit sem a dica. */
function block(i: number): Omit<VerseAttrs, "id"> {
  const { hint: _hint, ...attrs } = HITS[i];
  return attrs;
}

function renderDialog(initial?: Omit<VerseAttrs, "id">) {
  const onSubmit = vi.fn();
  const onRemove = vi.fn();
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (value?: Omit<VerseAttrs, "id">) => (
    <QueryClientProvider client={client}>
      <VerseDialog open onOpenChange={onOpenChange} initial={value} onSubmit={onSubmit} onRemove={value ? onRemove : undefined} />
    </QueryClientProvider>
  );
  const { rerender } = render(tree(initial));
  return { onSubmit, onRemove, onOpenChange, rerenderWith: (value?: Omit<VerseAttrs, "id">) => rerender(tree(value)) };
}

const search = () => screen.findByRole("combobox", { name: "Referência ou palavras do versículo" });
const reference = () => screen.findByRole("textbox", { name: "Referência" });
const text = () => screen.getByRole("textbox", { name: "Texto" });

async function typeSearch(value: string) {
  const field = await search();
  fireEvent.change(field, { target: { value } });
  return field;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listBibleTranslations.mockResolvedValue([BLIVRE]);
  api.searchBible.mockResolvedValue({ mode: "REFERENCE", hits: HITS });
});

describe("VerseDialog — busca", () => {
  it("abre na busca, com foco no campo, quando há tradução importada", async () => {
    renderDialog();
    const field = await search();
    expect(field).toHaveAttribute("placeholder", "João 3:16 ou um trecho");
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.queryByRole("textbox", { name: "Referência" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Tradução" })).not.toBeInTheDocument();
    const credit = await screen.findByText("BLIVRE · CC BY 3.0 BR");
    expect(credit).toHaveAttribute("title", BLIVRE.attribution);
    expect(screen.queryByText("Bíblia Livre")).not.toBeInTheDocument();
    expect(credit.parentElement).toHaveTextContent(/^BLIVRE · CC BY 3\.0 BR$/);
    expect(field).toHaveAttribute("aria-autocomplete", "list");
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Enter insere")).toBeInTheDocument();
  });

  it("procura depois da espera e lista os hits com referência e texto ou dica", async () => {
    renderDialog();
    await typeSearch("mt 5 14");
    expect(api.searchBible).not.toHaveBeenCalled();
    const list = await screen.findByRole("listbox");
    expect(api.searchBible).toHaveBeenCalledWith("mt 5 14", "BLIVRE");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("Mateus 5:14");
    expect(options[0]).toHaveTextContent(LUZ);
    expect(options[1]).toHaveTextContent("Mateus 5:14-16");
    expect(options[1]).toHaveTextContent("Três versículos · do 14 ao 16");
    expect(options[1]).not.toHaveTextContent(CANDEIA);
    expect(options[2]).toHaveTextContent("Mateus 5:15");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("menos de três caracteres não procura", async () => {
    renderDialog();
    await typeSearch("m");
    await typeSearch("mt");
    await new Promise((r) => setTimeout(r, 400));
    expect(api.searchBible).not.toHaveBeenCalled();
  });

  it("Enter insere o primeiro com os atributos do hit", async () => {
    const { onSubmit, onOpenChange } = renderDialog();
    const field = await typeSearch("mt 5 14");
    await screen.findByRole("listbox");
    const notCancelled = fireEvent.keyDown(field, { key: "Enter" });
    expect(notCancelled).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(block(0));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("↓ muda o destaque sem mover o cursor e Enter insere o segundo (três versículos)", async () => {
    const { onSubmit } = renderDialog();
    const field = await typeSearch("mt 5 14");
    await screen.findByRole("listbox");
    expect(fireEvent.keyDown(field, { key: "ArrowDown" })).toBe(false);
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    expect(fireEvent.keyDown(field, { key: "ArrowUp" })).toBe(false);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith(block(1));
    expect(onSubmit.mock.calls[0][0].verses).toHaveLength(3);
  });

  it("clicar insere", async () => {
    const { onSubmit } = renderDialog();
    await typeSearch("mt 5 14");
    fireEvent.click((await screen.findAllByRole("option"))[2]);
    expect(onSubmit).toHaveBeenCalledWith(block(2));
  });

  it("sem resultado mostra o aviso", async () => {
    api.searchBible.mockResolvedValue({ mode: "TEXT", hits: [] });
    renderDialog();
    await typeSearch("palavra que não existe");
    expect(await screen.findByText("Nada encontrado. Confira a referência ou digite à mão.")).toBeInTheDocument();
  });

  it("referência inexistente (NONE) mostra o aviso", async () => {
    api.searchBible.mockResolvedValue({ mode: "NONE", hits: [] });
    renderDialog();
    await typeSearch("jo 3 999");
    expect(await screen.findByText("Nada encontrado. Confira a referência ou digite à mão.")).toBeInTheDocument();
  });

  it("erro na busca mostra o aviso de erro", async () => {
    api.searchBible.mockRejectedValue(new Error("falhou"));
    renderDialog();
    await typeSearch("mt 5 14");
    expect(await screen.findByText("Não foi possível procurar agora.")).toBeInTheDocument();
  });

  it("enquanto procura mostra Procurando…", async () => {
    api.searchBible.mockReturnValue(new Promise(() => {}));
    renderDialog();
    await typeSearch("mt 5 14");
    expect(await screen.findByText("Procurando…")).toBeInTheDocument();
  });

  it("resposta atrasada de uma busca antiga não aparece sob o texto novo", async () => {
    let answerOld: (v: unknown) => void = () => {};
    api.searchBible.mockImplementation((q: string) =>
      q === "mt 5 14" ? new Promise((resolve) => (answerOld = resolve)) : new Promise(() => {}),
    );
    renderDialog();
    const field = await typeSearch("mt 5 14");
    await waitFor(() => expect(api.searchBible).toHaveBeenCalledWith("mt 5 14", "BLIVRE"));
    fireEvent.change(field, { target: { value: "mt 5 15" } });
    answerOld({ mode: "REFERENCE", hits: HITS });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("com duas traduções o seletor troca a tradução da busca", async () => {
    api.listBibleTranslations.mockResolvedValue([BLIVRE, KJA]);
    renderDialog();
    await typeSearch("mt 5 14");
    await waitFor(() => expect(api.searchBible).toHaveBeenCalledWith("mt 5 14", "BLIVRE"));
    const select = screen.getByRole("combobox", { name: "Tradução" });
    expect(select).toHaveValue("BLIVRE");
    fireEvent.change(select, { target: { value: "KJA" } });
    await waitFor(() => expect(api.searchBible).toHaveBeenCalledWith("mt 5 14", "KJA"));
    expect(screen.getByText("Uso permitido")).toHaveAttribute("title", KJA.attribution);
    expect(screen.queryByText("CC BY 3.0 BR")).not.toBeInTheDocument();
  });

  it("aria-expanded acompanha a lista de resultados", async () => {
    renderDialog();
    const field = await typeSearch("mt 5 14");
    expect(field).toHaveAttribute("aria-expanded", "false");
    await screen.findByRole("listbox");
    expect(field).toHaveAttribute("aria-expanded", "true");
  });

  it("Enter logo depois de digitar, antes da espera, não insere nada", async () => {
    const { onSubmit, onOpenChange } = renderDialog();
    const field = await typeSearch("mt 5 14");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(api.searchBible).not.toHaveBeenCalled();
  });
});

describe("VerseDialog — digitar à mão", () => {
  it("abre no manual, sem voltar para a busca, quando não há tradução", async () => {
    api.listBibleTranslations.mockResolvedValue([]);
    renderDialog();
    expect(await reference()).toHaveAttribute("placeholder", "João 3:16");
    expect(screen.queryByRole("combobox", { name: "Referência ou palavras do versículo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voltar para a busca" })).not.toBeInTheDocument();
  });

  it("abre no manual quando a lista de traduções falha", async () => {
    api.listBibleTranslations.mockRejectedValue(new Error("falhou"));
    renderDialog();
    expect(await reference()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voltar para a busca" })).not.toBeInTheDocument();
  });

  it("Inserir fica desligado sem referência ou sem texto", async () => {
    api.listBibleTranslations.mockResolvedValue([]);
    renderDialog();
    const ref = await reference();
    expect(screen.getByRole("heading", { name: "Inserir versículo" })).toBeInTheDocument();
    expect(ref).toHaveAttribute("maxLength", "120");
    const insert = screen.getByRole("button", { name: "Inserir" });
    expect(insert).toBeDisabled();
    fireEvent.change(ref, { target: { value: "João 3:16" } });
    expect(insert).toBeDisabled();
    fireEvent.change(text(), { target: { value: "   " } });
    expect(insert).toBeDisabled();
    fireEvent.change(ref, { target: { value: "  " } });
    fireEvent.change(text(), { target: { value: "Porque Deus amou o mundo" } });
    expect(insert).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("Digitar à mão mostra o formulário e insere com translation nulo; dá para voltar à busca", async () => {
    const { onSubmit, onOpenChange } = renderDialog();
    await search();
    fireEvent.click(await screen.findByRole("button", { name: "Digitar à mão" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar para a busca" }));
    await search();
    fireEvent.click(screen.getByRole("button", { name: "Digitar à mão" }));
    fireEvent.change(await reference(), { target: { value: "  João 3:16 " } });
    fireEvent.change(text(), { target: { value: "\n Porque Deus amou o mundo.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Inserir" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reference: "João 3:16",
      book: null,
      chapter: null,
      verseStart: null,
      verseEnd: null,
      translation: null,
      verses: [{ number: null, text: "Porque Deus amou o mundo." }],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("VerseDialog — alterar", () => {
  const MANUAL = {
    reference: "Salmos 23:1",
    book: null,
    chapter: null,
    verseStart: null,
    verseEnd: null,
    translation: null,
    verses: [{ number: null, text: "O Senhor é o meu pastor." }],
  };

  it("bloco digitado à mão abre no manual com os valores e Remover", async () => {
    const { onSubmit, onRemove } = renderDialog(MANUAL);
    expect(await reference()).toHaveValue("Salmos 23:1");
    expect(text()).toHaveValue("O Senhor é o meu pastor.");
    expect(screen.getByRole("heading", { name: "Alterar versículo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(onRemove).toHaveBeenCalled();
    fireEvent.change(text(), { target: { value: "O Senhor é o meu pastor; nada me faltará." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith({ ...MANUAL, verses: [{ number: null, text: "O Senhor é o meu pastor; nada me faltará." }] });
  });

  it("bloco da Bíblia abre na busca com a referência no campo e mostra Remover", async () => {
    const { onRemove } = renderDialog(block(1));
    expect(await search()).toHaveValue("Mateus 5:14-16");
    await waitFor(() => expect(api.searchBible).toHaveBeenCalledWith("Mateus 5:14-16", "BLIVRE"));
    expect(await screen.findAllByRole("option")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("novo objeto initial com o mesmo conteúdo não apaga o que foi digitado", async () => {
    const { rerenderWith } = renderDialog(MANUAL);
    fireEvent.change(await reference(), { target: { value: "Salmos 23:2" } });
    fireEvent.change(text(), { target: { value: "Ele me faz repousar." } });
    rerenderWith({ ...MANUAL, verses: [{ ...MANUAL.verses[0] }] });
    expect(await reference()).toHaveValue("Salmos 23:2");
    expect(text()).toHaveValue("Ele me faz repousar.");
  });

  it("salvar à mão um bloco da Bíblia grava-o como manual", async () => {
    const { onSubmit } = renderDialog(block(1));
    await search();
    fireEvent.click(await screen.findByRole("button", { name: "Digitar à mão" }));
    expect(await reference()).toHaveValue("Mateus 5:14-16");
    expect(text()).toHaveValue(`${LUZ} ${CANDEIA} ${BRILHE}`);
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reference: "Mateus 5:14-16",
      book: null,
      chapter: null,
      verseStart: null,
      verseEnd: null,
      translation: null,
      verses: [{ number: null, text: `${LUZ} ${CANDEIA} ${BRILHE}` }],
    });
  });
});
