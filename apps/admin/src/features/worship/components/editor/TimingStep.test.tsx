import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { Song } from "../../api/worship-api";
import type { WorshipRow } from "../../lib/document";
import { TimingStep } from "./TimingStep";

vi.mock("../../api/worship-api", async (orig) => {
  const actual = await orig<typeof import("../../api/worship-api")>();
  return {
    ...actual,
    fetchTimingSettings: vi.fn().mockResolvedValue({ slideLeadSeconds: 0.3, aiEnabled: false }),
    fetchLearnedTiming: vi.fn().mockResolvedValue(null),
    recordTimingCorrection: vi.fn().mockResolvedValue(undefined),
  };
});

const sampleRows: WorshipRow[] = [
  { id: "r1", type: "lyric", text: "Primeira frase", part: { kind: "VERSE", mood: null } },
  { id: "r2", type: "break" },
  { id: "r3", type: "lyric", text: "Segunda frase" },
  { id: "r4", type: "break" },
  { id: "r5", type: "lyric", text: "Terceira frase", part: { kind: "CHORUS", mood: null } },
];

const mockSong: Song = {
  id: "song-1",
  title: "Música Teste",
  artist: "Artista Teste",
  musicalKey: "G",
  bpm: 72,
  timeSignature: "4/4",
  holyricsId: null,
  status: "NEEDS_TIMING",
  pending: [],
  slideCount: 3,
  audio: {
    url: "https://example.com/audio.mp3",
    fileName: "audio.mp3",
    durationSeconds: 180,
    sizeBytes: 1024,
  },
  readyAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  rawLyrics: "Primeira frase\n\nSegunda frase\n\nTerceira frase",
  rows: sampleRows,
  referenceYoutubeId: null,
};

beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
});

function renderTimingStep(props?: {
  rows?: WorshipRow[];
  canEdit?: boolean;
  onChange?: (rows: WorshipRow[]) => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = (props?.onChange as Mock) ?? vi.fn();
  const onAudioUploaded = vi.fn();
  const saveNow = vi.fn().mockResolvedValue(true);

  render(
    <QueryClientProvider client={queryClient}>
      <TimingStep
        song={mockSong}
        rows={props?.rows ?? sampleRows}
        canEdit={props?.canEdit ?? true}
        onChange={onChange}
        onAudioUploaded={onAudioUploaded}
        saveNow={saveNow}
      />
    </QueryClientProvider>,
  );

  return { onChange, onAudioUploaded, saveNow };
}

describe("TimingStep - Modo Passador de Slides", () => {
  it("renderiza no modo passador por padrão com palco de dois slides", () => {
    renderTimingStep();

    expect(screen.getByRole("button", { name: /Modo Passador/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ajuste Fino & Linha do Tempo/i })).toBeInTheDocument();

    expect(screen.getByText(/No Telão/i)).toBeInTheDocument();
    expect(screen.getByText(/Próximo Slide/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Primeira frase/i).length).toBeGreaterThan(0);
  });

  it("alterna para o modo avançado ao clicar no botão", () => {
    renderTimingStep();

    fireEvent.click(screen.getByRole("button", { name: /Ajuste Fino & Linha do Tempo/i }));

    expect(screen.getByRole("region", { name: "Marcar" })).toBeInTheDocument();
    expect(screen.getByText(/Tempo = começo da frase/i)).toBeInTheDocument();
  });

  it("permite cortar o slide com o botão principal", () => {
    const { onChange } = renderTimingStep();

    const cutButton = screen.getByRole("button", { name: /Cortar \/ Passar Slide/i });
    expect(cutButton).toBeInTheDocument();

    fireEvent.click(cutButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedRows = (onChange as Mock).mock.calls[0][0] as WorshipRow[];
    const firstTimed = updatedRows.find((r) => r.id === "r1");
    expect(firstTimed?.time).toBeDefined();
    expect(firstTimed?.timeSource).toBe("MANUAL");
  });

  it("desfaz o último corte quando clica em Desfazer corte", () => {
    const timedRows: WorshipRow[] = [
      { id: "r1", type: "lyric", text: "Primeira frase", time: 10, timeSource: "MANUAL" },
      { id: "r2", type: "break" },
      { id: "r3", type: "lyric", text: "Segunda frase" },
    ];
    const { onChange } = renderTimingStep({ rows: timedRows });

    const undoButton = screen.getByRole("button", { name: /Desfazer corte/i });
    expect(undoButton).toBeEnabled();

    fireEvent.click(undoButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedRows = (onChange as Mock).mock.calls[0][0] as WorshipRow[];
    const untimed = updatedRows.find((r) => r.id === "r1");
    expect(untimed?.time).toBeUndefined();
  });
});
