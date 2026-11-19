import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type WorshipRow, deriveSong } from "../../lib/document";
import { TimingAiPanel } from "./TimingAiPanel";

const suggestTiming = vi.fn();
vi.mock("../../api/worship-api", () => ({ suggestTiming: (...args: unknown[]) => suggestTiming(...args) }));

const rows: WorshipRow[] = [
  { id: "a", type: "lyric", text: "um", part: { kind: "VERSE", mood: null }, time: 10 },
  { id: "b", type: "lyric", text: "dois", part: { kind: "CHORUS", mood: null }, time: 20 },
];
const { slides, parts } = deriveSong(rows);

function setup() {
  const onApply = vi.fn();
  const saveNow = vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TimingAiPanel songId="s1" slides={slides} parts={parts} enabled saveNow={saveNow} onApply={onApply} />
    </QueryClientProvider>,
  );
  return { onApply, saveNow };
}

describe("TimingAiPanel", () => {
  it("salva antes de perguntar, mostra a diferença e só aplica quando a pessoa aprova", async () => {
    suggestTiming.mockResolvedValue({ before: [10, 20], times: [10, 19.5], summary: "Refrão 0,5 s antes.", slideIds: ["a", "b"] });
    const { onApply, saveNow } = setup();
    fireEvent.change(screen.getByLabelText("O que ajustar nos tempos"), { target: { value: "adianta o refrão" } });
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    expect(await screen.findByText(/Refrão 0,5 s antes/)).toBeInTheDocument();
    expect(saveNow).toHaveBeenCalled();
    expect(suggestTiming).toHaveBeenCalledWith("s1", "adianta o refrão");
    expect(screen.getByText("−0,5 s")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ times: [10, 19.5] }), "adianta o refrão");
  });

  it("descartar some com a sugestão; sugestão de tempos antigos não aplica", async () => {
    suggestTiming.mockResolvedValue({ before: [10, 21], times: [9, 20], summary: "", slideIds: ["a", "b"] });
    const { onApply } = setup();
    fireEvent.change(screen.getByLabelText("O que ajustar nos tempos"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    await screen.findByText(/Peça de novo/);
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled();
  });
});
