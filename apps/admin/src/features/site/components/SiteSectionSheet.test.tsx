import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  SiteSectionDto,
  SiteSectionSpec,
} from "@/features/site/api/tenant-site-content-api";
import { SiteSectionSheet } from "./SiteSectionSheet";

vi.mock("@/components/ImageUploader", () => ({ ImageUploader: () => null }));

const spec: SiteSectionSpec = {
  key: "mission",
  title: "Missão",
  description: "d",
  icon: "Church",
  fields: [{ name: "badge", label: "Etiqueta", type: "text" }],
};

function section(key: string, badge: string): SiteSectionDto {
  return {
    key,
    title: key,
    description: "d",
    icon: "Church",
    value: { badge },
    updatedAt: null,
  };
}

function ui(s: SiteSectionDto, extra: Partial<Parameters<typeof SiteSectionSheet>[0]> = {}) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SiteSectionSheet
        section={s}
        spec={spec}
        icons={[]}
        canEdit
        onOpenChange={() => {}}
        {...extra}
      />
    </QueryClientProvider>
  );
}

const SOURCE = {
  label: "Ofertório & Redes",
  tab: "ofertorio" as const,
  hint: "PIX e dados bancários vêm da aba Ofertório & Redes.",
};

describe("SiteSectionSheet", () => {
  it("refetch da mesma seção com o sheet aberto não descarta o rascunho", () => {
    const { rerender } = render(ui(section("mission", "Original")));
    const input = screen.getByLabelText("Etiqueta") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Rascunho" } });

    rerender(ui(section("mission", "Original")));

    expect((screen.getByLabelText("Etiqueta") as HTMLInputElement).value).toBe(
      "Rascunho",
    );
  });

  it("abrir outra seção reinicializa o rascunho", () => {
    const { rerender } = render(ui(section("mission", "Original")));
    fireEvent.change(screen.getByLabelText("Etiqueta"), {
      target: { value: "Rascunho" },
    });

    rerender(ui(section("celulas", "Outra")));

    expect((screen.getByLabelText("Etiqueta") as HTMLInputElement).value).toBe(
      "Outra",
    );
  });

  it("restaurar original fica no menu de mais ações", () => {
    render(ui(section("mission", "Original")));
    expect(screen.queryByText("Restaurar original")).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais ações" }), { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: "Restaurar original" })).toBeInTheDocument();
  });

  it("mostra a origem dos dados e leva até a aba", () => {
    const onGoToSource = vi.fn();
    render(ui(section("giving", "Original"), { source: SOURCE, onGoToSource }));
    expect(screen.getByText(SOURCE.hint)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ofertório & Redes" }));
    expect(onGoToSource).toHaveBeenCalledWith("ofertorio");
  });

  it("com rascunho alterado, confirma antes de ir para a origem", () => {
    const onGoToSource = vi.fn();
    render(ui(section("giving", "Original"), { source: SOURCE, onGoToSource }));
    fireEvent.change(screen.getByLabelText("Etiqueta"), { target: { value: "Mudou" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ofertório & Redes" }));
    expect(onGoToSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onGoToSource).toHaveBeenCalledWith("ofertorio");
  });

  it("ajuda do campo fica num ícone, não em parágrafo", () => {
    const withHelp: SiteSectionSpec = {
      ...spec,
      fields: [{ name: "badge", label: "Etiqueta", type: "text", help: "Texto curto acima do título." }],
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SiteSectionSheet section={section("mission", "x")} spec={withHelp} icons={[]} canEdit onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Texto curto acima do título.")).toBeNull();
    expect(screen.getByRole("button", { name: "Ajuda: Etiqueta" })).toBeInTheDocument();
  });

  it("itens de lista começam recolhidos e abrem ao clicar no título", () => {
    const listSpec: SiteSectionSpec = {
      ...spec,
      fields: [
        {
          name: "benefits",
          label: "Benefícios",
          type: "list",
          itemLabel: "Benefício",
          fields: [{ name: "titulo", label: "Título", type: "text" }],
        },
      ],
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SiteSectionSheet
          section={{ ...section("celulas", "x"), value: { benefits: [{ titulo: "Comunhão" }] } }}
          spec={listSpec}
          icons={[]}
          canEdit
          onOpenChange={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByLabelText("Título")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Comunhão/ }));
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Comunhão");
  });
});
