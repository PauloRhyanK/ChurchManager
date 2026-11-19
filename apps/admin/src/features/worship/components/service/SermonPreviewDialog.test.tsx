import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SermonPreviewDialog } from "./SermonPreviewDialog";

const api = vi.hoisted(() => ({ getServiceSermon: vi.fn() }));
vi.mock("../../api/worship-api", () => api);

const PREVIEW = {
  title: "A luz do mundo",
  preacherName: "Pr. João",
  slideStyle: "MINIMAL",
  slides: [
    { kind: "TITLE", text: "A luz do mundo", reference: null },
    { kind: "VERSE", text: "Eu sou a luz do mundo", reference: "João 8:12" },
  ],
  mySermonId: null as string | null,
};

function renderDialog() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SermonPreviewDialog serviceId="c1" open onOpenChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("SermonPreviewDialog", () => {
  it("busca e mostra título, pregador e os slides", async () => {
    api.getServiceSermon.mockResolvedValue(PREVIEW);
    renderDialog();
    expect(await screen.findAllByTestId("slide-card")).toHaveLength(2);
    expect(api.getServiceSermon).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("dialog", { name: "A luz do mundo" })).toBeInTheDocument();
    expect(screen.getByText("Palavra de Pr. João")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir a palavra" })).not.toBeInTheDocument();
  });

  it("com mySermonId mostra Abrir a palavra", async () => {
    api.getServiceSermon.mockResolvedValue({ ...PREVIEW, mySermonId: "s9" });
    renderDialog();
    expect(await screen.findByRole("link", { name: "Abrir a palavra" })).toHaveAttribute("href", "/palavras/s9");
  });

  it("ao reabrir, mostra o carregando em vez dos slides antigos enquanto busca de novo", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["worship", "service-sermon", "c1"], PREVIEW);
    let finish!: (v: unknown) => void;
    api.getServiceSermon.mockReturnValue(new Promise((res) => (finish = res)));
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SermonPreviewDialog serviceId="c1" open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("status", { name: "Carregando" })).toBeInTheDocument();
    expect(screen.queryByTestId("slide-card")).not.toBeInTheDocument();
    finish({ ...PREVIEW, slides: [PREVIEW.slides[0]] });
    expect(await screen.findAllByTestId("slide-card")).toHaveLength(1);
  });

  it("sem slides avisa", async () => {
    api.getServiceSermon.mockResolvedValue({ ...PREVIEW, slides: [] });
    renderDialog();
    expect(await screen.findByText("Esta palavra ainda não tem slides.")).toBeInTheDocument();
    expect(screen.queryByTestId("slide-card")).not.toBeInTheDocument();
  });
});
