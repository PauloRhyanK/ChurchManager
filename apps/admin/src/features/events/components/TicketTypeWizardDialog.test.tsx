import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFieldDefinitionDto } from "@/features/events/api/tenant-event-fields-api";
import type { EventTicketTypeDto } from "@/features/events/api/tenant-event-ticket-types-api";
import { TicketTypeWizardDialog } from "./TicketTypeWizardDialog";

const fieldsApi = vi.hoisted(() => ({
  fetchEventFieldDefinitions: vi.fn(),
  createEventFieldDefinition: vi.fn(),
}));
const ticketsApi = vi.hoisted(() => ({
  createEventTicketType: vi.fn(),
  updateEventTicketType: vi.fn(),
}));

vi.mock("@/features/events/api/tenant-event-fields-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-fields-api")>()),
  ...fieldsApi,
}));
vi.mock("@/features/events/api/tenant-event-ticket-types-api", async (orig) => ({
  ...(await orig<typeof import("@/features/events/api/tenant-event-ticket-types-api")>()),
  ...ticketsApi,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const nameField: EventFieldDefinitionDto = {
  id: "f-name",
  key: "name",
  label: "Nome",
  type: "TEXT",
  options: null,
  isSystem: true,
  createdAt: "",
};

/** Ingresso pago só por PIX, mas com parcelas antigas gravadas de quando aceitava cartão. */
const ticket: EventTicketTypeDto = {
  id: "t1",
  eventId: "e1",
  name: "Inteira",
  description: null,
  priceCents: 5000,
  feeCents: 0,
  quantityTotal: null,
  quantitySold: 0,
  quantityRemaining: null,
  minPerOrder: 1,
  maxPerOrder: 10,
  salesOpensAt: null,
  salesClosesAt: null,
  visibility: "PUBLIC",
  allowGuestRegistration: true,
  communityLink: null,
  allowedBillingTypes: ["PIX"],
  maxInstallments: 3,
  isSoldOut: false,
  active: true,
  fields: [
    {
      fieldId: "f-name",
      key: "name",
      label: "Nome",
      type: "TEXT",
      options: null,
      isSystem: true,
      enabled: true,
      required: true,
      sortOrder: 0,
    },
  ],
  createdAt: "",
  updatedAt: "",
};

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TicketTypeWizardDialog
        eventId="e1"
        eventDate="2026-11-20"
        ticketType={ticket}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function goToStep(step: 2 | 3) {
  await screen.findByText(/passo 1 de 3/);
  await waitFor(() => expect(screen.getByLabelText("Nome")).toHaveValue("Inteira"));
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  await screen.findByText(/passo 2 de 3/);
  if (step === 3) {
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/passo 3 de 3/);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fieldsApi.fetchEventFieldDefinitions.mockResolvedValue([nameField]);
  ticketsApi.updateEventTicketType.mockResolvedValue(ticket);
});

describe("TicketTypeWizardDialog", () => {
  it("falha ao carregar os campos mostra erro no passo 3 e não deixa guardar", async () => {
    fieldsApi.fetchEventFieldDefinitions.mockRejectedValue(
      new AxiosError("Network Error", "ERR_NETWORK"),
    );
    renderWizard();
    await goToStep(3);

    expect(screen.getByText("Não foi possível carregar os campos de inscrição.")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ticketsApi.updateEventTicketType).not.toHaveBeenCalled();
  });

  it("passo 2 mostra a taxa ao lado do preço e esconde-a se o ingresso for gratuito", async () => {
    renderWizard();
    await goToStep(2);
    expect(screen.getByLabelText("Taxa (R$)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ingresso gratuito" }));
    await waitFor(() => expect(screen.queryByLabelText("Taxa (R$)")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Preço (R$)")).toHaveValue("0,00");
  });

  it("mínimo por pedido maior que o máximo bloqueia o passo 2 com mensagem", async () => {
    renderWizard();
    await goToStep(2);
    fireEvent.change(screen.getByLabelText("Mín/pedido"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Máx/pedido"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));

    expect(
      await screen.findByText("O mínimo por pedido não pode ser maior que o máximo"),
    ).toBeInTheDocument();
    expect(screen.getByText(/passo 2 de 3/)).toBeInTheDocument();
  });

  it("sem cartão de crédito envia maxInstallments null e a taxa digitada", async () => {
    renderWizard();
    await goToStep(2);
    fireEvent.change(screen.getByLabelText("Taxa (R$)"), { target: { value: "2,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/passo 3 de 3/);
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(ticketsApi.updateEventTicketType).toHaveBeenCalledTimes(1));
    const [, , body] = ticketsApi.updateEventTicketType.mock.calls[0];
    expect(body.maxInstallments).toBeNull();
    expect(body.feeCents).toBe(250);
    expect(body.fieldConfigs).toEqual([
      { fieldId: "f-name", enabled: true, required: true, sortOrder: 0 },
    ]);
  });
});
