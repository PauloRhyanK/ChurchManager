import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchLyricsSettings, saveLyricsSettings } = vi.hoisted(() => ({ fetchLyricsSettings: vi.fn(), saveLyricsSettings: vi.fn() }));
vi.mock("../../api/worship-api", () => ({ fetchLyricsSettings, saveLyricsSettings }));
vi.mock("./AudioCard", () => ({ AudioCard: () => null }));
vi.mock("./LyricsDocument", () => ({ LyricsDocument: () => <div>Documento</div> }));
vi.mock("./SlidesPreview", () => ({ SlidesPreview: () => null }));

import { LyricsStep } from "./LyricsStep";

const song = {
  id: "song-1", title: "Gratidão", artist: null, musicalKey: null, bpm: null, timeSignature: null,
  holyricsId: null, status: "NEEDS_TIMING" as const, pending: [], slideCount: 1, audio: null,
  readyAt: null, updatedAt: "", createdAt: "", rawLyrics: "", rows: [], referenceYoutubeId: null,
};
const rows = [{ id: "line", type: "lyric" as const, text: "Gratidão", part: { kind: "VERSE" as const, mood: null } }];

function renderLyrics(canManageSettings: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LyricsStep
        song={song}
        rows={rows}
        draft={false}
        version={0}
        canEdit
        canManageSettings={canManageSettings}
        onChange={vi.fn()}
        onOrganize={vi.fn()}
        organizing={false}
        onAudioUploaded={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("LyricsStep: padrão compartilhado", () => {
  beforeEach(() => {
    fetchLyricsSettings.mockReset().mockResolvedValue({ lyricMaxChars: 28, lyricMaxLines: 3 });
    saveLyricsSettings.mockReset().mockResolvedValue({ lyricMaxChars: 24, lyricMaxLines: 2 });
  });

  it("mostra os limites da igreja e permite que SETTINGS:EDIT os altere", async () => {
    renderLyrics(true);
    expect(await screen.findByText(/Padrão da igreja: até 28 caracteres · 3 linhas\/slide/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    fireEvent.change(screen.getByLabelText("Caracteres por linha"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Linhas por slide"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar padrão da igreja" }));
    await waitFor(() => expect(saveLyricsSettings).toHaveBeenCalledWith(24, 2));
  });

  it("deixa os limites visíveis, mas não mostra configuração a quem não tem SETTINGS:EDIT", async () => {
    renderLyrics(false);
    expect(await screen.findByText(/Padrão da igreja: até 28 caracteres · 3 linhas\/slide/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurar" })).not.toBeInTheDocument();
  });
});
