import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };
const perms = vi.hoisted(() => ({ modules: [] as string[] }));

vi.mock("@/features/access/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: (module: string) => perms.modules.includes(module) }),
}));

function renderSidebar() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  perms.modules = [];
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

describe("AppSidebar — Palavras", () => {
  it("o item some sem a permissão SERMONS", () => {
    perms.modules = ["WORSHIP"];
    renderSidebar();
    expect(screen.queryByRole("link", { name: "Palavras" })).not.toBeInTheDocument();
  });

  it("com SERMONS o item aparece logo depois de Cultos", () => {
    perms.modules = ["WORSHIP", "SERMONS"];
    renderSidebar();
    const palavras = screen.getByRole("link", { name: "Palavras" });
    expect(palavras).toHaveAttribute("href", "/palavras");
    const links = screen.getAllByRole("link").map((a) => a.textContent);
    expect(links.indexOf("Palavras")).toBe(links.indexOf("Roteiro") + 1);
  });
});
