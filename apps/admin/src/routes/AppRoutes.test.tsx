import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, useNavigate, type NavigateFunction } from "react-router-dom";
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
vi.mock("@/features/church/pages/ChurchPage", async () => {
  const { useLocation } = await import("react-router-dom");
  function ChurchPageMock() {
    return <p>Página Igreja {useLocation().search}</p>;
  }
  return { default: ChurchPageMock };
});
vi.mock("@/features/events/pages/RegistrationsPage", () => ({
  default: () => <p>Página de inscrições</p>,
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// O estado nasce na montagem: o texto só muda se a página for remontada.
vi.mock("@/features/events/pages/EventDetailPage", async () => {
  const { useState } = await import("react");
  const { useParams } = await import("react-router-dom");
  return {
    EventDetailPage: () => {
      const { id } = useParams<{ id: string }>();
      const [mountedFor] = useState(id);
      return <p>Detalhe montado para {mountedFor}</p>;
    },
  };
});
vi.mock("@/features/events/pages/EventFormPage", async () => {
  const { useState } = await import("react");
  const { useParams } = await import("react-router-dom");
  function EventFormPageMock() {
    const { id } = useParams<{ id: string }>();
    const [mountedFor] = useState(id ?? "novo");
    return <p>Formulário montado para {mountedFor}</p>;
  }
  return { default: EventFormPageMock };
});

let navigate: NavigateFunction;

function CaptureNavigate() {
  navigate = useNavigate();
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
      <CaptureNavigate />
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

describe("AppRoutes — troca de evento sem sair da rota", () => {
  beforeEach(() => {
    perms.modules = { EVENTS: "EDIT" };
  });

  it("/eventos/:id remonta o detalhe quando o id muda", async () => {
    renderAt("/eventos/e1");
    expect(await screen.findByText("Detalhe montado para e1")).toBeInTheDocument();

    act(() => {
      void navigate("/eventos/e2");
    });

    expect(await screen.findByText("Detalhe montado para e2")).toBeInTheDocument();
  });

  it("/eventos/:id/editar remonta o formulário quando o id muda", async () => {
    renderAt("/eventos/e1/editar");
    expect(await screen.findByText("Formulário montado para e1")).toBeInTheDocument();

    act(() => {
      void navigate("/eventos/e2/editar");
    });

    expect(await screen.findByText("Formulário montado para e2")).toBeInTheDocument();
  });

  it("de /eventos/novo para /eventos/:id/editar remonta o formulário", async () => {
    renderAt("/eventos/novo");
    expect(await screen.findByText("Formulário montado para novo")).toBeInTheDocument();

    act(() => {
      void navigate("/eventos/e1/editar");
    });

    expect(await screen.findByText("Formulário montado para e1")).toBeInTheDocument();
  });

  it("sem EDIT em eventos o formulário continua bloqueado", async () => {
    perms.modules = { EVENTS: "VIEW" };
    renderAt("/eventos/e1/editar");
    expect(await screen.findByText("Página inicial")).toBeInTheDocument();
    expect(screen.queryByText(/Formulário montado/)).not.toBeInTheDocument();
  });
});

describe("AppRoutes — Site dentro de Igreja", () => {
  it("/site redireciona para a aba Site de Igreja", async () => {
    perms.modules = { SITE: "VIEW" };
    renderAt("/site");
    expect(await screen.findByText("Página Igreja ?aba=site")).toBeInTheDocument();
  });

  it("/igreja abre com permissão só de Site", async () => {
    perms.modules = { SITE: "VIEW" };
    renderAt("/igreja");
    expect(await screen.findByText(/Página Igreja/)).toBeInTheDocument();
  });

  it("/igreja sem Igreja nem Site volta para o início", async () => {
    perms.modules = { EVENTS: "VIEW" };
    renderAt("/igreja");
    expect(await screen.findByText("Página inicial")).toBeInTheDocument();
  });
});
