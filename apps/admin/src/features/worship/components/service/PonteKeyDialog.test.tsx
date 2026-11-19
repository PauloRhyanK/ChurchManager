import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PonteKeyDialog } from "./PonteKeyDialog";

const api = vi.hoisted(() => ({ fetchPonteKey: vi.fn(), generatePonteKey: vi.fn(), revokePonteKey: vi.fn() }));
vi.mock("../../api/worship-api", async (orig) => ({
  ...(await orig<typeof import("../../api/worship-api")>()),
  ...api,
}));

const PATH = "/public/tenants/demo/worship/services/next";
const none = { active: false, hint: null, createdAt: null, lastUsedAt: null, path: PATH };
const active = { active: true, hint: "abcd", createdAt: "2026-11-20T12:00:00.000Z", lastUsedAt: null, path: PATH };

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PonteKeyDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("PonteKeyDialog", () => {
  it("sem chave: gerar mostra a chave uma vez, com o endereço que a Ponte consulta", async () => {
    api.fetchPonteKey.mockResolvedValue(none);
    api.generatePonteKey.mockResolvedValue({ ...active, key: "ponte_segredo" });
    renderDialog();
    expect(await screen.findByText(/Nenhuma chave gerada/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${PATH}$`))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revogar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar a chave" }));
    expect(await screen.findByText("ponte_segredo")).toBeInTheDocument();
    expect(screen.getByText(/não aparece de novo/)).toBeInTheDocument();
  });

  it("com chave em uso: mostra só o final dela e pede confirmação antes de trocar ou revogar", async () => {
    api.fetchPonteKey.mockResolvedValue(active);
    api.revokePonteKey.mockResolvedValue(none);
    renderDialog();
    expect(await screen.findByText(/termina em/)).toHaveTextContent("abcd");
    expect(screen.getByText(/ainda não leu com ela/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gerar outra chave" }));
    expect(screen.getByText(/parar de valer na hora/)).toBeInTheDocument();
    expect(api.generatePonteKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Revogar" }));
    expect(api.revokePonteKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revogar a chave" }));
    await waitFor(() => expect(api.revokePonteKey).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Nenhuma chave gerada/)).toBeInTheDocument();
  });
});
