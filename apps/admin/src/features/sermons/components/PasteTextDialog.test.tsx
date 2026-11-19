import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASTE_MAX_CHARS, PasteTextDialog } from "./PasteTextDialog";

const api = vi.hoisted(() => ({ createSermonFromText: vi.fn(), getSermonAi: vi.fn() }));
vi.mock("../api/sermons-api", () => api);

const ONE_MODEL = { enabled: true, models: [{ id: "anthropic:claude-opus-5-5", label: "Claude Opus 5.5" }] };
const TWO_MODELS = { enabled: true, models: [...ONE_MODEL.models, { id: "anthropic:claude-haiku-5-5", label: "Claude Haiku 5.5" }] };

function renderDialog() {
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PasteTextDialog open onOpenChange={onOpenChange} onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onCreated, onOpenChange };
}

const paste = async (text: string) => fireEvent.change(await screen.findByRole("textbox", { name: "Texto da palavra" }), { target: { value: text } });
const organize = () => screen.getByRole("button", { name: /Organizar e criar/ });

describe("PasteTextDialog", () => {
  beforeEach(() => {
    api.createSermonFromText.mockReset();
    api.getSermonAi.mockReset().mockResolvedValue(ONE_MODEL);
  });

  it("envia só o texto colado e entrega a palavra criada", async () => {
    api.createSermonFromText.mockResolvedValue({ id: "s9" });
    const { onCreated, onOpenChange } = renderDialog();
    await paste("A luz\n1. A luz chama");
    fireEvent.click(organize());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "s9" }));
    expect(api.createSermonFromText).toHaveBeenCalledWith({ text: "A luz\n1. A luz chama" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("com mais de um modelo, manda o escolhido", async () => {
    api.getSermonAi.mockResolvedValue(TWO_MODELS);
    api.createSermonFromText.mockResolvedValue({ id: "s9" });
    renderDialog();
    await paste("A luz");
    fireEvent.change(await screen.findByRole("combobox", { name: "Modelo de IA" }), { target: { value: "anthropic:claude-haiku-5-5" } });
    fireEvent.click(organize());
    await waitFor(() => expect(api.createSermonFromText).toHaveBeenCalledWith({ text: "A luz", model: "anthropic:claude-haiku-5-5" }));
  });

  it("vazio ou acima do limite não envia", async () => {
    renderDialog();
    await paste("   ");
    expect(organize()).toBeDisabled();
    await paste("x".repeat(PASTE_MAX_CHARS + 1));
    expect(organize()).toBeDisabled();
    expect(screen.getByText(/Cole uma parte de cada vez/)).toBeInTheDocument();
  });

  it("mostra a mensagem do servidor e mantém o texto", async () => {
    const headers = new AxiosHeaders();
    api.createSermonFromText.mockRejectedValue(
      new AxiosError("x", "ERR", undefined, undefined, {
        status: 422, statusText: "", headers, config: { headers }, data: { message: "O modelo não pôde organizar este texto. Crie a palavra e cole o texto no editor." },
      }),
    );
    const { onCreated } = renderDialog();
    await paste("A luz");
    fireEvent.click(organize());
    expect(await screen.findByText(/não pôde organizar este texto/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Texto da palavra" })).toHaveValue("A luz");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("sem IA ligada, explica e não deixa colar", async () => {
    api.getSermonAi.mockResolvedValue({ enabled: false, models: [] });
    renderDialog();
    expect(await screen.findByText(/ainda não está disponível/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Texto da palavra" })).not.toBeInTheDocument();
    expect(organize()).toBeDisabled();
  });
});
