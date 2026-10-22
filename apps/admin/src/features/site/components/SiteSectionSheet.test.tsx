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

function ui(s: SiteSectionDto) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SiteSectionSheet
        section={s}
        spec={spec}
        icons={[]}
        canEdit
        onOpenChange={() => {}}
      />
    </QueryClientProvider>
  );
}

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
});
