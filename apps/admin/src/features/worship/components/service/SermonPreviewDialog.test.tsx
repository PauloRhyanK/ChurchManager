import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
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

  it("cópia nova (com a face), cópia dos modelos antigos e cópia só com kind, text e reference aparecem na identidade", async () => {
    api.getServiceSermon.mockResolvedValue({
      ...PREVIEW,
      slides: [
        { kind: "VERSE", text: "Eu sou a luz do mundo", layout: "VERSE", title: "1. A luz chama", verse: "Eu sou a luz do mundo", reference: "João 8:12", items: null, start: null },
        { kind: "POINT", text: "A luz guia", layout: "M02", title: "A luz guia", subtitle: "Antes de procurar", verse: null, reference: null },
        { kind: "VERSE", text: "Vós sois a luz do mundo", reference: "Mateus 5:14" },
      ],
    });
    renderDialog();
    expect(await screen.findAllByTestId("slide-card")).toHaveLength(3);
    const role = (text: string) => screen.getAllByText(text).map((e) => e.closest<HTMLElement>("[data-slide-role]")!.dataset.slideRole);
    expect(role("1. A luz chama")).toEqual(["title"]);
    expect(role("João 8:12")).toEqual(["reference"]);
    expect(role("A luz guia")).toEqual(["title"]);
    expect(screen.queryByText("Antes de procurar")).not.toBeInTheDocument();
    expect(role("Vós sois a luz do mundo")).toEqual(["verse"]);
    expect(role("Mateus 5:14")).toEqual(["title", "reference"]);
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

  it("focar a janela não busca de novo (não troca os slides pelo carregando)", async () => {
    api.getServiceSermon.mockResolvedValue(PREVIEW);
    renderDialog();
    await screen.findAllByTestId("slide-card");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.getServiceSermon).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status", { name: "Carregando" })).not.toBeInTheDocument();
  });

  it("sem slides avisa", async () => {
    api.getServiceSermon.mockResolvedValue({ ...PREVIEW, slides: [] });
    renderDialog();
    expect(await screen.findByText("Esta palavra ainda não tem slides.")).toBeInTheDocument();
    expect(screen.queryByTestId("slide-card")).not.toBeInTheDocument();
  });
});
