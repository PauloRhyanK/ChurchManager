import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImageUploader, MAX_IMAGE_BYTES, validateImageFile } from "./ImageUploader";

const { post, toast } = vi.hoisted(() => ({
  post: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ api: { post }, getApiErrorMessage: () => "erro genérico" }));
vi.mock("sonner", () => ({ toast }));

describe("validateImageFile", () => {
  it("aceita JPEG, PNG, WebP e GIF até 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(validateImageFile({ type, size: MAX_IMAGE_BYTES })).toBeNull();
    }
  });
  it("recusa SVG e outros tipos", () => {
    expect(validateImageFile({ type: "image/svg+xml", size: 10 })).toMatch(/Formato não aceito/);
    expect(validateImageFile({ type: "application/pdf", size: 10 })).toMatch(/Formato não aceito/);
  });
  it("recusa arquivo acima de 5 MB", () => {
    expect(validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(/5 MB/);
  });
});

describe("ImageUploader", () => {
  function pick(file: File) {
    const { container } = render(<ImageUploader value={null} onChange={onChange} hint="Dica do pastor" />);
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });
  }
  const onChange = vi.fn();

  it("mostra a dica recebida e não envia arquivo inválido", async () => {
    pick(new File(["x"], "a.svg", { type: "image/svg+xml" }));
    expect(screen.getByText("Dica do pastor")).toBeTruthy();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("envia imagem válida e devolve a URL", async () => {
    post.mockResolvedValueOnce({ data: { url: "https://cdn/x.png" } });
    pick(new File(["x"], "a.png", { type: "image/png" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://cdn/x.png"));
  });
});
