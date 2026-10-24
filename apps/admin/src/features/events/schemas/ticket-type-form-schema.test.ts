import { describe, expect, it } from "vitest";
import { ticketTypeFormSchema, type TicketTypeFormValues } from "./ticket-type-form-schema";

function values(overrides: Partial<TicketTypeFormValues> = {}): TicketTypeFormValues {
  return {
    name: "Inteira",
    description: "",
    active: true,
    visibility: "PUBLIC",
    salesOpensAt: "",
    salesClosesAt: "",
    allowGuestRegistration: true,
    communityLink: "",
    allowedBillingTypes: ["PIX"],
    maxInstallments: "",
    priceInput: "50,00",
    feeInput: "",
    quantityTotal: "",
    minPerOrder: 1,
    maxPerOrder: 10,
    fieldConfigs: [],
    ...overrides,
  };
}

describe("ticketTypeFormSchema", () => {
  it("rejeita mínimo por pedido maior que o máximo", () => {
    const result = ticketTypeFormSchema.safeParse(values({ minPerOrder: 5, maxPerOrder: 2 }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "O mínimo por pedido não pode ser maior que o máximo",
    );
  });

  it("aceita mínimo igual ao máximo", () => {
    const result = ticketTypeFormSchema.safeParse(values({ minPerOrder: 3, maxPerOrder: 3 }));
    expect(result.success).toBe(true);
  });

  it("rejeita taxa que não é um valor em reais", () => {
    const result = ticketTypeFormSchema.safeParse(values({ feeInput: "dez" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("Taxa inválida");
  });

  it("ignora a taxa em ingresso gratuito (o campo fica escondido)", () => {
    const result = ticketTypeFormSchema.safeParse(
      values({ priceInput: "0,00", allowedBillingTypes: [], feeInput: "dez" }),
    );
    expect(result.success).toBe(true);
  });
});
