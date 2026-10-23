import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventSettingsPage from "./EventSettingsPage";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const tagsApi = vi.hoisted(() => ({
  fetchEventTags: vi.fn(),
  createEventTag: vi.fn(),
  deleteEventTag: vi.fn(),
}));
const fieldsApi = vi.hoisted(() => ({
  fetchEventFieldDefinitions: vi.fn(),
  createEventFieldDefinition: vi.fn(),
  deleteEventFieldDefinition: vi.fn(),
}));
const perms = vi.hoisted(() => ({ edit: true }));

vi.mock("@/features/events/api/tenant-event-tags-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-tags-api")>()),
  ...tagsApi,
}));
vi.mock("@/features/events/api/tenant-event-fields-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-fields-api")>()),
  ...fieldsApi,
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (_m: string, level: string) => perms.edit || level === "VIEW" }),
}));

const tag = { id: "t1", name: "retiro", slug: "retiro", usageCount: 2, createdAt: "" };
const customField = {
  id: "f1",
  key: "empresa",
  label: "Empresa",
  type: "TEXT",
  options: null,
  isSystem: false,
  createdAt: "",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={ROUTER_FUTURE}>
        <EventSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.edit = true;
  tagsApi.fetchEventTags.mockResolvedValue([tag]);
  fieldsApi.fetchEventFieldDefinitions.mockResolvedValue([customField]);
});

describe("EventSettingsPage", () => {
  it("sem permissão de edição lista etiquetas e campos sem criar nem remover", async () => {
    perms.edit = false;
    renderPage();
    expect(await screen.findByText("retiro")).toBeInTheDocument();
    expect(await screen.findByText("Empresa")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Nova etiqueta (ex.: retiro)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rótulo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adicionar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover etiqueta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover campo" })).not.toBeInTheDocument();
  });

  it("com permissão de edição mostra criar e remover", async () => {
    renderPage();
    expect(await screen.findByText("retiro")).toBeInTheDocument();
    expect(await screen.findByText("Empresa")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nova etiqueta (ex.: retiro)")).toBeInTheDocument();
    expect(screen.getByLabelText("Rótulo")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Adicionar/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remover etiqueta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover campo" })).toBeInTheDocument();
  });
});
