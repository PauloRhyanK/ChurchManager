import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Song } from "../../api/worship-api";
import type { WorshipRow } from "../../lib/document";
import { PreviewStep } from "./PreviewStep";

const rows: WorshipRow[] = [
  { id: "a", type: "cue", target: "DRUMS", text: "entra cheia", part: { kind: "VERSE", mood: "WORSHIP" }, time: 0 },
  { id: "b", type: "lyric", text: "Antes do sol nascer" },
  { id: "c", type: "break" },
  { id: "d", type: "lyric", text: "Tua voz me chamou", time: 8 },
];

const song = (over: Partial<Song> = {}): Song => ({
  id: "s1",
  title: "Luz da Manhã",
  artist: null,
  musicalKey: null,
  bpm: null,
  timeSignature: null,
  holyricsId: null,
  status: "NEEDS_TIMING",
  pending: ["CONFIRM"],
  slideCount: 2,
  audio: { url: "https://cdn/a.mp3", fileName: "a.mp3", durationSeconds: 60, sizeBytes: 1 },
  readyAt: null,
  updatedAt: "",
  createdAt: "",
  rawLyrics: "",
  rows,
  referenceYoutubeId: null,
  ...over,
});

// O jsdom não toca áudio; a prévia só precisa que o tocador exista.
beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

const checklist = () => within(screen.getByRole("heading", { name: "Conferência" }).closest("section") as HTMLElement);

describe("PreviewStep", () => {
  it("no segundo zero mostra o primeiro slide: letra no telão; instrução e 'A seguir' só no retorno", () => {
    render(<PreviewStep song={song()} rows={rows} />);
    expect(screen.getByTestId("telao")).toHaveTextContent("ANTES DO SOL NASCER");
    expect(screen.getByTestId("telao")).not.toHaveTextContent("entra cheia");
    const retorno = screen.getByTestId("retorno");
    expect(retorno).toHaveTextContent("Bateria · entra cheia");
    expect(retorno).toHaveTextContent("A seguir: TUA VOZ ME CHAMOU");
  });

  it("conferência completa, com a prévia assistida como lembrete", () => {
    render(<PreviewStep song={song()} rows={rows} />);
    const list = checklist();
    expect(list.getByText(/Letra · 2 slides/)).toHaveTextContent("(feito)");
    expect(list.getByText(/Áudio · 1:00/)).toHaveTextContent("(feito)");
    expect(list.getByText(/Tempo de todos os slides/)).toHaveTextContent("(feito)");
    expect(list.getByText(/Clima de todas as partes/)).toHaveTextContent("(feito)");
    expect(list.getByText(/Prévia assistida até o fim/)).toHaveTextContent("(falta) · recomendado");
  });

  it("sem áudio e com slide sem tempo, a conferência aponta o que falta", () => {
    const semTempo = rows.map((r) => (r.id === "d" ? { ...r, time: null } : r));
    render(<PreviewStep song={song({ audio: null })} rows={semTempo} />);
    const list = checklist();
    expect(list.getByText(/^Áudio/)).toHaveTextContent("(falta)");
    expect(list.getByText(/Tempo de todos os slides/)).toHaveTextContent("(falta)");
    expect(screen.getByText(/Sem áudio não há o que tocar/)).toBeInTheDocument();
  });

  it("texto para o Holyrics: instrução com // e letra em maiúsculas", () => {
    render(<PreviewStep song={song()} rows={rows} />);
    expect(screen.getByLabelText("Letra para o Holyrics").textContent).toBe(
      "//Bateria: entra cheia\nANTES DO SOL NASCER\n\nTUA VOZ ME CHAMOU",
    );
  });
});
