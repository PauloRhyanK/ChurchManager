import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ServicePlan } from "../../api/worship-api";
import { MomentsTab } from "./MomentsTab";

const api = vi.hoisted(() => ({ getServiceSermon: vi.fn() }));
vi.mock("../../api/worship-api", () => api);

const SERMON = { title: "A luz do mundo", preacherName: "Pr. João", estimatedMinutes: 28, slideCount: 2 };

function plan(over: Partial<ServicePlan>): ServicePlan {
  return {
    id: "c1",
    date: "2026-11-22",
    startTime: "19:00",
    name: "Culto",
    templateId: null,
    moments: [
      { id: "m1", name: "Abertura", kind: "GENERIC", durationMinutes: 10, startsAt: "19:00", effectiveMinutes: 10 },
      { id: "m2", name: "Palavra", kind: "SERMON", durationMinutes: 40, startsAt: "19:10", effectiveMinutes: 40 },
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
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MomentsTab service={service} canEdit saving={false} onSave={onSave} onOpenWorship={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSave };
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
      { id: "m1", name: "Abertura", kind: "GENERIC", durationMinutes: 10 },
      { name: "Palavra", kind: "SERMON", durationMinutes: 40 },
    ]);
  });
});
