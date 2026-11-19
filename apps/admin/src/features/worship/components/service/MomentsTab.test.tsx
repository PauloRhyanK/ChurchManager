import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ServiceMoment, ServicePlan } from "../../api/worship-api";
import { MomentsTab } from "./MomentsTab";

const api = vi.hoisted(() => ({ getServiceSermon: vi.fn() }));
vi.mock("../../api/worship-api", () => api);

const SERMON = { title: "A luz do mundo", preacherName: "Pr. João", estimatedMinutes: 28, slideCount: 2 };

function moment(m: Pick<ServiceMoment, "id" | "name" | "kind" | "durationMinutes" | "startsAt"> & Partial<ServiceMoment>): ServiceMoment {
  return { effectiveMinutes: m.durationMinutes, effectiveSeconds: m.durationMinutes * 60, songId: null, song: null, ...m };
}

const SONG: NonNullable<ServiceMoment["song"]> = {
  id: "s1",
  title: "Rio de paz",
  artist: null,
  musicalKey: "D",
  bpm: 68,
  timeSignature: null,
  holyricsId: null,
  status: "READY",
  pending: [],
  slideCount: 8,
  audio: { url: "https://cdn/a.mp3", fileName: "a.mp3", durationSeconds: 250, sizeBytes: 1 },
  readyAt: null,
  updatedAt: "",
  mood: "WORSHIP",
};

function plan(over: Partial<ServicePlan>): ServicePlan {
  return {
    id: "c1",
    date: "2026-11-22",
    startTime: "19:00",
    name: "Culto",
    templateId: null,
    moments: [
      moment({ id: "m1", name: "Abertura", kind: "GENERIC", durationMinutes: 10, startsAt: "19:00" }),
      moment({ id: "m2", name: "Palavra", kind: "SERMON", durationMinutes: 40, startsAt: "19:10" }),
    ],
    endsAt: "19:50",
    worshipStartsAt: null,
    songs: [],
    sermon: null,
    updatedAt: "",
    ...over,
  };
}

function renderTab(service: ServicePlan) {
  const onSave = vi.fn();
  const onAddSong = vi.fn();
  const onChooseSong = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MomentsTab
          service={service}
          canEdit
          saving={false}
          onSave={onSave}
          onAddSong={onAddSong}
          onChooseSong={onChooseSong}
          onFillWorship={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSave, onAddSong, onChooseSong };
}

describe("MomentsTab: palavra do culto", () => {
  it("momento SERMON com palavra mostra o título e a duração estimada", () => {
    renderTab(plan({ sermon: SERMON }));
    const chip = screen.getByText("A luz do mundo");
    expect(chip.closest("[title]")).toHaveAttribute("title", "Palavra de Pr. João");
    expect(screen.getByLabelText("Duração de Palavra em minutos")).toHaveValue("40");
    expect(screen.getByLabelText("Duração de Palavra em minutos").closest("label")).toHaveTextContent(
      "min· palavra estimada em 28",
    );
    expect(screen.queryByText(/não tem o momento Palavra/)).not.toBeInTheDocument();
  });

  it("a etiqueta da palavra é um botão que busca e mostra os slides", async () => {
    api.getServiceSermon.mockResolvedValue({
      title: "A luz do mundo",
      preacherName: "Pr. João",
      slideStyle: "MINIMAL",
      slides: [{ kind: "VERSE", text: "Eu sou a luz do mundo", reference: "João 8:12" }],
      mySermonId: null,
    });
    renderTab(plan({ sermon: SERMON }));
    expect(api.getServiceSermon).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /A luz do mundo/ }));
    const dialog = await screen.findByRole("dialog", { name: "A luz do mundo" });
    expect(await within(dialog).findAllByTestId("slide-card")).toHaveLength(1);
    expect(api.getServiceSermon).toHaveBeenCalledWith("c1");
    expect(within(dialog).queryByRole("link", { name: "Abrir a palavra" })).not.toBeInTheDocument();
  });

  it("palavra vazia não mostra a estimativa", () => {
    renderTab(plan({ sermon: { ...SERMON, estimatedMinutes: 0 } }));
    expect(screen.getByText("A luz do mundo")).toBeInTheDocument();
    expect(screen.queryByText(/estimada em/)).not.toBeInTheDocument();
  });

  it("sem palavra não mostra nada", () => {
    renderTab(plan({}));
    expect(screen.queryByText("A luz do mundo")).not.toBeInTheDocument();
    expect(screen.queryByText(/estimada em/)).not.toBeInTheDocument();
    expect(screen.queryByText(/não tem o momento Palavra/)).not.toBeInTheDocument();
  });

  it("palavra sem momento SERMON avisa e o botão acrescenta o momento no fim", () => {
    const service = plan({ sermon: SERMON, moments: plan({}).moments.slice(0, 1) });
    const { onSave } = renderTab(service);
    expect(screen.getByText("Este culto tem uma palavra, mas o roteiro não tem o momento Palavra.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar o momento Palavra" }));
    expect(onSave).toHaveBeenCalledWith([
      { id: "m1", name: "Abertura", kind: "GENERIC", durationMinutes: 10, songId: null },
      { name: "Palavra", kind: "SERMON", durationMinutes: 40 },
    ]);
  });
});

describe("MomentsTab: músicas no meio do roteiro", () => {
  const intercalado = () =>
    plan({
      moments: [
        moment({ id: "m1", name: "Abertura", kind: "GENERIC", durationMinutes: 3, startsAt: "19:00" }),
        moment({ id: "m2", name: "Rio de paz", kind: "SONG", durationMinutes: 5, startsAt: "19:03", songId: "s1", song: SONG, effectiveSeconds: 250, effectiveMinutes: 4 }),
        moment({ id: "m3", name: "Oração", kind: "GENERIC", durationMinutes: 3, startsAt: "19:07" }),
        moment({ id: "m4", name: "Música", kind: "SONG", durationMinutes: 5, startsAt: "19:10" }),
      ],
      endsAt: "19:15",
    });

  it("a música é uma linha do roteiro, com tom, bpm, clima e duração, na ordem", () => {
    renderTab(intercalado());
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[1]).toContain("19:03");
    expect(rows[1]).toContain("Rio de paz");
    expect(rows[1]).toContain("Tom D · 68 bpm");
    expect(rows[1]).toContain("Adoração");
    expect(rows[1]).toContain("4:10");
    expect(rows[2]).toContain("19:07");
    expect(screen.getAllByRole("listitem")[2]).toContainElement(screen.getByLabelText("Nome do momento Oração"));
    expect(screen.getByText("4 itens · 2 músicas · termina às 19:15")).toBeInTheDocument();
  });

  it("+ Música pede a música; espaço reservado pede a música dele; tirar a música tira o item", () => {
    const { onSave, onAddSong, onChooseSong } = renderTab(intercalado());
    fireEvent.click(screen.getByRole("button", { name: "Música" }));
    expect(onAddSong).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Escolher música" }));
    expect(onChooseSong).toHaveBeenCalledWith("m4");
    fireEvent.click(screen.getByRole("button", { name: "Remover Rio de paz" }));
    expect(onSave.mock.calls[0][0].map((m: { id: string }) => m.id)).toEqual(["m1", "m3", "m4"]);
  });
});
