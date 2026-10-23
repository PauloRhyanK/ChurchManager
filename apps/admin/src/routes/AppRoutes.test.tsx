import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./AppRoutes";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const perms = vi.hoisted(() => ({ modules: {} as Record<string, "VIEW" | "EDIT" | null> }));

vi.mock("./ProtectedRoute", () => ({ ProtectedRoute: () => <Outlet /> }));
vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({
    can: (module: string, level: string) => {
      const granted = perms.modules[module] ?? null;
      return granted === "EDIT" || (granted === "VIEW" && level === "VIEW");
    },
  }),
}));
vi.mock("@/pages/Index", () => ({ default: () => <p>Página inicial</p> }));
vi.mock("@/features/events/pages/RegistrationsPage", () => ({
  default: () => <p>Página de inscrições</p>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  perms.modules = {};
});

describe("AppRoutes — /eventos/inscricoes", () => {
  it("sem VIEW em inscrições volta para o início", async () => {
    perms.modules = { EVENTS: "VIEW" };
    renderAt("/eventos/inscricoes");
    expect(await screen.findByText("Página inicial")).toBeInTheDocument();
    expect(screen.queryByText("Página de inscrições")).not.toBeInTheDocument();
  });

  it("com VIEW em eventos e em inscrições abre a página", async () => {
    perms.modules = { EVENTS: "VIEW", EVENT_REGISTRATIONS: "VIEW" };
    renderAt("/eventos/inscricoes");
    expect(await screen.findByText("Página de inscrições")).toBeInTheDocument();
  });
});
