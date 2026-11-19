import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddSongDialog } from "./AddSongDialog";

const api = vi.hoisted(() => ({ fetchSongs: vi.fn(), createSong: vi.fn(), uploadSongAudio: vi.fn() }));
vi.mock("../../api/worship-api", async (orig) => ({
  ...(await orig<typeof import("../../api/worship-api")>()),
  ...api,
}));

const base = {
  artist: null,
  timeSignature: null,
  pending: [],
  slideCount: 3,
  readyAt: null,
  updatedAt: "2026-11-19T00:00:00.000Z",
};
const SONGS = [
  { ...base, id: "s1", title: "Luz da Manhã", musicalKey: "Sol", bpm: 72, status: "READY", audio: { url: "u", fileName: "a.mp3", durationSeconds: 252, sizeBytes: 1 } },
  { ...base, id: "s2", title: "Tua Luz", musicalKey: "Lá", bpm: 84, status: "NEEDS_TIMING", pending: ["TIMES"], audio: null },
  { ...base, id: "s3", title: "Firme Rocha", musicalKey: null, bpm: null, status: "READY", audio: null },
];

function renderDialog() {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  const onOpenEditor = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddSongDialog open onOpenChange={onOpenChange} onAdd={onAdd} onOpenEditor={onOpenEditor} />
    </QueryClientProvider>,
  );
  return { onAdd, onOpenChange, onOpenEditor };
}

const type = (value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: "Nome da música" }), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSongs.mockResolvedValue({ items: SONGS, counts: { all: 3, ready: 2, pending: 1 } });
});

describe("AddSongDialog", () => {
  it("achou no repertório: clicar adiciona e fecha", async () => {
    const { onAdd, onOpenChange } = renderDialog();
    type("luz");
    const item = await screen.findByRole("button", { name: /Luz da Manhã/ });
    expect(screen.getByRole("button", { name: /Tua Luz/ })).toHaveTextContent("Falta o tempo");
    expect(screen.queryByRole("button", { name: /Firme Rocha/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar “luz” como música nova" })).toBeInTheDocument();
    fireEvent.click(item);
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("não achou: oferece criar com o nome digitado", async () => {
    renderDialog();
    type("Vem com Tudo");
    expect(await screen.findByText("Ainda não está no repertório.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar “Vem com Tudo”" }));
    expect(screen.getByLabelText("Nome da música")).toHaveValue("Vem com Tudo");
    expect(screen.getByRole("button", { name: /Organizar/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Só adicionar ao roteiro" })).toBeEnabled();
  });

  it("Só adicionar ao roteiro cria como rascunho (sem organizar) e adiciona", async () => {
    api.createSong.mockResolvedValue({ id: "novo" });
    const { onAdd, onOpenChange, onOpenEditor } = renderDialog();
    type("Vem com Tudo");
    fireEvent.click(await screen.findByRole("button", { name: "Criar “Vem com Tudo”" }));
    fireEvent.click(screen.getByRole("button", { name: "Só adicionar ao roteiro" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("novo"));
    expect(api.createSong).toHaveBeenCalledWith({ title: "Vem com Tudo", rawLyrics: "" });
    expect(api.uploadSongAudio).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onOpenEditor).not.toHaveBeenCalled();
  });

  it("Organizar cria organizada, adiciona ao roteiro e abre o editor", async () => {
    api.createSong.mockResolvedValue({ id: "novo" });
    const { onAdd, onOpenEditor } = renderDialog();
    type("Vem com Tudo");
    fireEvent.click(await screen.findByRole("button", { name: "Criar “Vem com Tudo”" }));
    fireEvent.change(screen.getByLabelText("Letra"), { target: { value: "Linha um\n\nLinha dois" } });
    fireEvent.click(screen.getByRole("button", { name: /Organizar/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Lendo a letra");
    expect(screen.queryByText("Enviando o áudio")).not.toBeInTheDocument();
    expect(screen.queryByText(/Encaixando a letra no tempo/)).not.toBeInTheDocument();
    await waitFor(() => expect(onOpenEditor).toHaveBeenCalledWith("novo"), { timeout: 4000 });
    expect(api.createSong).toHaveBeenCalledWith({ title: "Vem com Tudo", rawLyrics: "Linha um\n\nLinha dois", organize: true });
    expect(onAdd).toHaveBeenCalledWith("novo");
  });
});
