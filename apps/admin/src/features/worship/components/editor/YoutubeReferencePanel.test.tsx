import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../../api/worship-api";
import { YoutubeReferencePanel } from "./YoutubeReferencePanel";

const api = vi.hoisted(() => ({
  setSongReferenceYoutube: vi.fn(),
  removeSongReferenceYoutube: vi.fn(),
  setSongYoutubeAudio: vi.fn(),
}));
vi.mock("../../api/worship-api", async (orig) => ({ ...(await orig<object>()), ...api }));

const song = {
  id: "song-1",
  title: "Luz da Manhã",
  audio: { url: "https://cdn/vs.mp3", fileName: "vs-click.mp3", durationSeconds: 200, sizeBytes: 1 },
  referenceYoutubeId: null,
} as unknown as Song;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("YoutubeReferencePanel", () => {
  it("sem referência, oferece escolher um vídeo", () => {
    render(<YoutubeReferencePanel song={song} canEdit onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Escolher vídeo de referência" })).toBeTruthy();
    expect(screen.queryByTitle(/Referência do YouTube/)).toBeNull();
  });

  it("com referência, mostra o player do YouTube daquele vídeo, sem ligação com o VS", () => {
    render(<YoutubeReferencePanel song={{ ...song, referenceYoutubeId: "dQw4w9WgXcQ" }} canEdit onChanged={vi.fn()} />);
    const frame = screen.getByTitle("Referência do YouTube: Luz da Manhã") as HTMLIFrameElement;
    expect(frame.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
  });

  it("tirar a referência chama a API e devolve a música sem tocar no áudio-guia", async () => {
    const saved = { ...song, referenceYoutubeId: null };
    api.removeSongReferenceYoutube.mockResolvedValue(saved);
    const onChanged = vi.fn();
    render(<YoutubeReferencePanel song={{ ...song, referenceYoutubeId: "dQw4w9WgXcQ" }} canEdit onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar a referência" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(saved));
    expect(api.removeSongReferenceYoutube).toHaveBeenCalledWith("song-1");
    expect(api.setSongYoutubeAudio).not.toHaveBeenCalled();
  });

  it("sem permissão de editar, não mostra os botões", () => {
    render(<YoutubeReferencePanel song={{ ...song, referenceYoutubeId: "dQw4w9WgXcQ" }} canEdit={false} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Tirar a referência" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Trocar o vídeo de referência" })).toBeNull();
  });
});
