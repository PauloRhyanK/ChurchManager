import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDto } from "@/features/events/api/tenant-events-api";
import { EventSiteDetailsTab } from "./EventSiteDetailsTab";

const api = vi.hoisted(() => ({ updateEvent: vi.fn() }));

vi.mock("@/features/events/api/tenant-events-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-events-api")>()),
  ...api,
}));
vi.mock("@/components/ImageUploader", () => ({ ImageUploader: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const event = {
  id: "e1",
  title: "Conferência",
  coverImageUrl: null,
  videoUrl: null,
  shortDescription: "Resumo antigo",
  detailsHtml: null,
} as unknown as EventDto;

beforeEach(() => {
  vi.clearAllMocks();
  api.updateEvent.mockImplementation(async (_id: string, body: Partial<EventDto>) => ({
    ...event,
    ...body,
  }));
});

describe("EventSiteDetailsTab", () => {
  it("guardar grava a resposta do PUT na cache do evento", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["event", "e1"], event);
    render(
      <QueryClientProvider client={client}>
        <EventSiteDetailsTab event={event} canEdit />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Descrição curta"), {
      target: { value: "Resumo novo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar detalhes" }));

    await waitFor(() =>
      expect(client.getQueryData<EventDto>(["event", "e1"])?.shortDescription).toBe(
        "Resumo novo",
      ),
    );
  });
});
