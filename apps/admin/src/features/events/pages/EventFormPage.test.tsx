import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDto } from "@/features/events/api/tenant-events-api";
import EventFormPage from "./EventFormPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const api = vi.hoisted(() => ({
  fetchEvent: vi.fn(),
  updateEvent: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock("@/features/events/api/tenant-events-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-events-api")>()),
  ...api,
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ImageUploader", () => ({
  ImageUploader: ({ onChange }: { onChange: (url: string | null) => void }) => (
    <button type="button" onClick={() => onChange("https://cdn.exemplo.com/nova-capa.jpg")}>
      Trocar capa
    </button>
  ),
}));
vi.mock("@/features/events/components/EventTagsInput", () => ({ EventTagsInput: () => null }));
vi.mock("@/features/events/components/EventLocationInput", () => ({
  EventLocationInput: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pastEvent: EventDto = {
  id: "e1",
  title: "Culto de Natal",
  description: null,
  format: "IN_PERSON",
  onlineUrl: null,
  shortDescription: null,
  detailsHtml: null,
  videoUrl: null,
  coverImageUrl: null,
  mediaMeta: null,
  date: "2020-12-24",
  timeStart: "19:00:00",
  timeEnd: null,
  location: "Templo sede",
  imageUrl: null,
  tag: null,
  tags: [],
  published: true,
  slug: "culto-de-natal",
  timezone: "America/Sao_Paulo",
  registrationClosesAt: null,
  termsUrl: null,
  currency: "BRL",
  createdAt: "2020-11-01T00:00:00.000Z",
  updatedAt: "2020-11-01T00:00:00.000Z",
};

function renderAt(
  path: string,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
        <Routes>
          <Route path="/eventos/novo" element={<EventFormPage />} />
          <Route path="/eventos/:id/editar" element={<EventFormPage />} />
          <Route path="/eventos/:id" element={<p>Página do evento</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// "Servidor" em memória: o GET devolve o que o último PUT gravou, como a API real.
let serverEvent: EventDto;

beforeEach(() => {
  vi.clearAllMocks();
  serverEvent = { ...pastEvent };
  api.fetchEvent.mockImplementation(async () => ({ ...serverEvent }));
  api.updateEvent.mockImplementation(async (_id: string, body: Partial<EventDto>) => {
    serverEvent = { ...serverEvent, ...body };
    return { ...serverEvent };
  });
});

describe("EventFormPage", () => {
  it("trocar a capa não descarta o que já foi digitado", async () => {
    renderAt("/eventos/e1/editar");
    const title = await screen.findByLabelText("Título");
    await waitFor(() => expect(title).toHaveValue("Culto de Natal"));

    fireEvent.change(title, { target: { value: "Culto de Natal — novo horário" } });
    fireEvent.click(screen.getByRole("button", { name: "Trocar capa" }));

    await waitFor(() =>
      expect(api.updateEvent).toHaveBeenCalledWith("e1", {
        coverImageUrl: "https://cdn.exemplo.com/nova-capa.jpg",
      }),
    );
    // Dá tempo a um eventual refetch do evento chegar e reiniciar o formulário.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByLabelText("Título")).toHaveValue("Culto de Natal — novo horário");
  });

  it("evento passado pode ser editado e guardado com o horário limpo", async () => {
    renderAt("/eventos/e1/editar");
    const date = await screen.findByLabelText("Data");
    await waitFor(() => expect(date).toHaveValue("2020-12-24"));
    expect(date).not.toHaveAttribute("min");

    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar alterações" }));

    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledTimes(1));
    expect(api.updateEvent.mock.calls[0][0]).toBe("e1");
    expect(api.updateEvent.mock.calls[0][1]).toMatchObject({
      date: "2020-12-24",
      timeStart: null,
      timeEnd: null,
    });
    expect(await screen.findByText("Página do evento")).toBeInTheDocument();
  });

  it("na edição preenche com o evento actualizado do servidor, não com a cache antiga", async () => {
    // Como no painel: a cache ainda "fresca" não seria pedida de novo ao montar.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    client.setQueryData(["event", "e1"], { ...pastEvent, title: "Título antigo em cache" });
    serverEvent = { ...pastEvent, title: "Título actualizado" };

    renderAt("/eventos/e1/editar", client);

    const title = await screen.findByLabelText("Título");
    await waitFor(() => expect(title).toHaveValue("Título actualizado"));
    expect(api.fetchEvent).toHaveBeenCalledWith("e1");
  });

  it("se o GET falhar ao abrir, mostra o erro e não preenche com a cache antiga", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    client.setQueryData(["event", "e1"], { ...pastEvent, title: "Título antigo em cache" });
    api.fetchEvent.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));

    renderAt("/eventos/e1/editar", client);

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar alterações" })).not.toBeInTheDocument();
  });

  it("na criação o evento nasce rascunho", async () => {
    api.createEvent.mockImplementation(async (body: Partial<EventDto>) => ({
      ...pastEvent,
      ...body,
      id: "novo",
    }));
    renderAt("/eventos/novo");
    expect(await screen.findByRole("switch")).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Retiro" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2999-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    await waitFor(() => expect(api.createEvent).toHaveBeenCalledTimes(1));
    expect(api.createEvent.mock.calls[0][0]).toMatchObject({ published: false });
  });

  it("na criação a data continua limitada a hoje em diante", async () => {
    renderAt("/eventos/novo");
    expect(await screen.findByLabelText("Data")).toHaveAttribute("min");
  });
});
