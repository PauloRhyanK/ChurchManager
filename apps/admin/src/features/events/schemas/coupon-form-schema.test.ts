import { describe, expect, it } from "vitest";
import { couponFormSchema } from "./coupon-form-schema";

describe("couponFormSchema", () => {
  it("valida e transforma código para caixa alta", () => {
    const res = couponFormSchema.safeParse({
      code: "  desconto10  ",
      discountType: "PERCENTAGE",
      discountPercentage: 10,
      restrictionType: "ALL",
      selectedTicketTypeIds: [],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.code).toBe("DESCONTO10");
      expect(res.data.discountPercentage).toBe(10);
    }
  });

  it("rejeita código com caracteres especiais proibidos", () => {
    const res = couponFormSchema.safeParse({
      code: "CUPOM@2026",
      discountType: "PERCENTAGE",
      discountPercentage: 10,
      restrictionType: "ALL",
    });
    expect(res.success).toBe(false);
  });

  it("exige porcentagem entre 1 e 100", () => {
    const resOver = couponFormSchema.safeParse({
      code: "PROMO150",
      discountType: "PERCENTAGE",
      discountPercentage: 150,
      restrictionType: "ALL",
    });
    expect(resOver.success).toBe(false);

    const resZero = couponFormSchema.safeParse({
      code: "PROMO0",
      discountType: "PERCENTAGE",
      discountPercentage: 0,
      restrictionType: "ALL",
    });
    expect(resZero.success).toBe(false);
  });

  it("exige valor fixo em dinheiro maior que zero", () => {
    const resValid = couponFormSchema.safeParse({
      code: "FIXO30",
      discountType: "FIXED",
      discountMoney: "30,00",
      restrictionType: "ALL",
    });
    expect(resValid.success).toBe(true);

    const resZero = couponFormSchema.safeParse({
      code: "FIXO0",
      discountType: "FIXED",
      discountMoney: "0,00",
      restrictionType: "ALL",
    });
    expect(resZero.success).toBe(false);
  });

  it("exige ao menos um ingresso quando selecionado restrictionType SELECTED", () => {
    const resEmpty = couponFormSchema.safeParse({
      code: "SOVIP",
      discountType: "PERCENTAGE",
      discountPercentage: 50,
      restrictionType: "SELECTED",
      selectedTicketTypeIds: [],
    });
    expect(resEmpty.success).toBe(false);

    const resWithTicket = couponFormSchema.safeParse({
      code: "SOVIP",
      discountType: "PERCENTAGE",
      discountPercentage: 50,
      restrictionType: "SELECTED",
      selectedTicketTypeIds: ["t1"],
    });
    expect(resWithTicket.success).toBe(true);
  });

  it("rejeita data de término anterior à de início", () => {
    const res = couponFormSchema.safeParse({
      code: "VALIDADE",
      discountType: "PERCENTAGE",
      discountPercentage: 10,
      restrictionType: "ALL",
      validFrom: "2026-12-31",
      validUntil: "2026-12-01",
    });
    expect(res.success).toBe(false);
  });
});
