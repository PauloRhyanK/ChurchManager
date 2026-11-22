import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../../api/worship-api";
import { AudioCard } from "./AudioCard";

const api = vi.hoisted(() => ({
  setSongReferenceYoutube: vi.fn(),
  setSongYoutubeAudio: vi.fn(),
  searchYoutube: vi.fn(),
}));
vi.mock("../../api/worship-api", async (orig) => ({ ...(await orig<object>()), ...api }));

const withVs = {
  id: "song-1",
  title: "Luz da Manhã",
  rows: [],
  audio: { url: "https://cdn/vs.mp3", fileName: "vs-click.mp3", durationSeconds: 200, sizeBytes: 1 },
  referenceYoutubeId: null,
} as unknown as Song;

function renderCard(song: Song, onUploaded = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AudioCard song={song} canEdit onUploaded={onUploaded} />
    </QueryClientProvider>,
  );
  return onUploaded;
}

async function pasteLink() {
  fireEvent.change(screen.getByPlaceholderText(/link do vídeo/), {
    target: { value: "https://youtu.be/dQw4w9WgXcQ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AudioCard", () => {
  it("com o VS já enviado, o YouTube vira só referência e não troca o áudio-guia", async () => {
    const saved = { ...withVs, referenceYoutubeId: "dQw4w9WgXcQ" };
    api.setSongReferenceYoutube.mockResolvedValue(saved);
    const onUploaded = renderCard(withVs);
    fireEvent.click(screen.getByRole("button", { name: "Escolher vídeo de referência do YouTube" }));
    await pasteLink();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(saved));
    expect(api.setSongReferenceYoutube).toHaveBeenCalledWith("song-1", "https://youtu.be/dQw4w9WgXcQ");
    expect(api.setSongYoutubeAudio).not.toHaveBeenCalled();
  });

  it("sem áudio nenhum, o YouTube ainda pode virar o áudio-guia", async () => {
    const saved = { ...withVs };
    api.setSongYoutubeAudio.mockResolvedValue(saved);
    const onUploaded = renderCard({ ...withVs, audio: null });
    fireEvent.click(screen.getByRole("button", { name: /Buscar no YouTube/ }));
    await pasteLink();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(saved));
    expect(api.setSongReferenceYoutube).not.toHaveBeenCalled();
  });
});
