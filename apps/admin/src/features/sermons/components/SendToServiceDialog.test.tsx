import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendToServiceDialog } from "./SendToServiceDialog";

const api = vi.hoisted(() => ({
  listServiceOptions: vi.fn(),
  previewDelivery: vi.fn(),
  sendSermon: vi.fn(),
  cancelDelivery: vi.fn(),
}));
vi.mock("../api/sermons-api", () => api);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const OPTIONS = [
  { id: "c1", date: "2026-11-22", startTime: "19:00", name: "Culto de domingo", hasSermon: false, isMine: false },
  { id: "c2", date: "2026-11-29", startTime: "19:00", name: "Culto de domingo", hasSermon: true, isMine: false },
  { id: "c3", date: "2026-12-06", startTime: "09:30", name: "Culto da manhã", hasSermon: true, isMine: true },
];
const SENT = { id: "s1" } as never;

function conflict() {
  return Object.assign(new Error("conflict"), {
    isAxiosError: true,
    response: { status: 409, data: { code: "SERVICE_HAS_SERMON" } },
  });
}

function renderDialog(
  over: { delivery?: unknown; ensureSaved?: () => Promise<boolean>; client?: QueryClient } = {},
) {
  const onChanged = vi.fn();
  const onOpenChange = vi.fn();
  const ensureSaved = over.ensureSaved ?? vi.fn().mockResolvedValue(true);
  const client = over.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SendToServiceDialog
        open
        onOpenChange={onOpenChange}
        sermonId="s1"
        sermonTitle="A luz do mundo"
        delivery={(over.delivery ?? null) as never}
        ensureSaved={ensureSaved}
        onChanged={onChanged}
      />
    </QueryClientProvider>,
  );
  return { onChanged, onOpenChange, ensureSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listServiceOptions.mockResolvedValue(OPTIONS);
  api.sendSermon.mockResolvedValue(SENT);
  api.cancelDelivery.mockResolvedValue(SENT);
});

describe("SendToServiceDialog", () => {
  it("lista os cultos com data, nome e situação", async () => {
    renderDialog();
    expect(screen.getByText("Enviar para um culto")).toBeInTheDocument();
    expect(screen.getByText("A luz do mundo")).toBeInTheDocument();
    expect(await screen.findByText("Domingo, 22/11 · 19h")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Qual culto" })).toBeInTheDocument();
    expect(screen.getByText("Culto de domingo · já tem uma palavra")).toBeInTheDocument();
    // isMine sozinho não basta: sem envio desta palavra, é "já tem uma palavra".
    expect(screen.getByText("Culto da manhã · já tem uma palavra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("esta palavra só no culto do envio atual", async () => {
    renderDialog({ delivery: { date: "2026-12-06", startTime: "09:30", serviceId: "c3", serviceName: "Culto da manhã" } });
    expect(await screen.findByText("Culto da manhã · esta palavra")).toBeInTheDocument();
    expect(screen.getAllByText("Culto de domingo · já tem uma palavra")).toHaveLength(1);
  });

  it("a prévia da data anterior some enquanto a nova espera", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("radio", { name: "Outra data" }));
    api.previewDelivery.mockResolvedValue({ service: null, occupied: false });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-12-13" } });
    const text = "Ainda não há culto nesse dia. A palavra fica guardada e entra sozinha quando ele for criado.";
    expect(await screen.findByText(text)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-12-14" } });
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("sem cultos mostra o aviso", async () => {
    api.listServiceOptions.mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByText("Nenhum culto criado ainda.")).toBeInTheDocument();
  });

  it("escolher um culto e enviar chama sendSermon com serviceId", async () => {
    const { onChanged, onOpenChange } = renderDialog();
    fireEvent.click(await screen.findByRole("radio", { name: /Domingo, 22\/11/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(api.sendSermon).toHaveBeenCalledWith("s1", { serviceId: "c1" }, undefined));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(SENT, "sent"));
    expect(toast.success).toHaveBeenCalledWith("Palavra enviada.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("não envia se sobrou texto sem salvar", async () => {
    renderDialog({ ensureSaved: vi.fn().mockResolvedValue(false) });
    fireEvent.click(await screen.findByRole("radio", { name: /Domingo, 22\/11/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Salve a palavra antes de enviar."));
    expect(api.sendSermon).not.toHaveBeenCalled();
  });

  it("Outra data: mostra cada texto da prévia e envia com data e hora", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("radio", { name: "Outra data" }));
    expect(screen.getByLabelText("Hora")).toHaveValue("19:00");

    api.previewDelivery.mockResolvedValue({
      service: { id: "c9", date: "2026-12-06", startTime: "19:00", name: "x" },
      occupied: false,
    });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-12-06" } });
    expect(await screen.findByText("Entra no culto de domingo, 06/12 · 19h.")).toBeInTheDocument();
    expect(api.previewDelivery).toHaveBeenCalledWith("2026-12-06", "19:00");

    api.previewDelivery.mockResolvedValue({ service: null, occupied: false });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-12-13" } });
    expect(
      await screen.findByText("Ainda não há culto nesse dia. A palavra fica guardada e entra sozinha quando ele for criado."),
    ).toBeInTheDocument();

    api.previewDelivery.mockResolvedValue({
      service: { id: "c9", date: "2026-12-20", startTime: "19:00", name: "x" },
      occupied: true,
    });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-12-20" } });
    expect(await screen.findByText("O culto de domingo, 20/12 · 19h já tem uma palavra.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() =>
      expect(api.sendSermon).toHaveBeenCalledWith("s1", { date: "2026-12-20", startTime: "19:00" }, undefined),
    );
  });

  it("409 pede confirmação e Trocar reenvia com replace", async () => {
    api.sendSermon.mockRejectedValueOnce(conflict());
    renderDialog();
    fireEvent.click(await screen.findByRole("radio", { name: /Domingo, 29\/11/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Este culto já tem uma palavra. Trocar?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    await waitFor(() => expect(api.sendSermon).toHaveBeenLastCalledWith("s1", { serviceId: "c2" }, true));
  });

  it("rascunho não mostra Cancelar o envio", async () => {
    renderDialog();
    await screen.findByText("Domingo, 22/11 · 19h");
    expect(screen.queryByRole("button", { name: "Cancelar o envio" })).not.toBeInTheDocument();
  });

  it("palavra enviada: Cancelar o envio confirma e chama cancelDelivery", async () => {
    const { onChanged } = renderDialog({
      delivery: { date: "2026-12-06", startTime: "09:30", serviceId: "c3", serviceName: "Culto da manhã" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar o envio" }));
    expect(api.cancelDelivery).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole("button", { name: "Cancelar o envio" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.cancelDelivery).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(SENT, "cancelled"));
  });

  it("Outra data não deixa escolher dia antes de hoje", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("radio", { name: "Outra data" }));
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(screen.getByLabelText("Data")).toHaveAttribute("min", today);
  });

  it("enviar e cancelar invalidam também os cultos", async () => {
    for (const run of ["send", "cancel"] as const) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const spy = vi.spyOn(client, "invalidateQueries");
      const delivery = run === "cancel" ? { date: "2026-11-22", startTime: "19:00", serviceId: "c1", serviceName: "Culto" } : null;
      const view = renderDialog({ client, delivery });
      if (run === "send") {
        fireEvent.click(await screen.findByRole("radio", { name: /Domingo, 22\/11/ }));
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(view.onChanged).toHaveBeenCalled());
      } else {
        fireEvent.click(await screen.findByRole("button", { name: "Cancelar o envio" }));
        const buttons = await screen.findAllByRole("button", { name: "Cancelar o envio" });
        fireEvent.click(buttons[buttons.length - 1]);
        await waitFor(() => expect(view.onChanged).toHaveBeenCalled());
      }
      expect(spy).toHaveBeenCalledWith({ queryKey: ["worship"] });
      cleanup();
    }
  });
});
