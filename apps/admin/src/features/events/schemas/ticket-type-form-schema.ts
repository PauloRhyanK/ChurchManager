import { z } from "zod";
import { isSalesCloseAfterOpen } from "@/features/events/lib/event-form-validation";
import { parseMoneyToCents } from "@/features/events/lib/format";

export const BILLING_TYPES = ["PIX", "BOLETO", "CREDIT_CARD"] as const;

export const ticketTypeStep1Schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(255),
  description: z.string().max(5000).optional().or(z.literal("")),
  active: z.boolean(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  salesOpensAt: z.string().optional().or(z.literal("")),
  salesClosesAt: z.string().optional().or(z.literal("")),
  allowGuestRegistration: z.boolean(),
  communityLink: z
    .string()
    .max(2048)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || v === "" || /^https?:\/\/.+/i.test(v),
      "URL inválida",
    ),
});

export function isFreeTicketPrice(priceInput: string): boolean {
  const cents = parseMoneyToCents(priceInput);
  return cents === 0;
}

const perOrderLimit = (fallback: number) =>
  z.coerce
    .number()
    .int("Use um número inteiro")
    .min(1, "Use um valor entre 1 e 100")
    .max(100, "Use um valor entre 1 e 100")
    .default(fallback);

/** Object schema only — `.merge()` requires ZodObject, not ZodEffects. */
export const ticketTypeStep2ObjectSchema = z.object({
  allowedBillingTypes: z.array(z.enum(BILLING_TYPES)),
  maxInstallments: z.string().optional().or(z.literal("")),
  priceInput: z.string().min(1, "Preço obrigatório"),
  feeInput: z.string().optional().or(z.literal("")),
  quantityTotal: z.string().optional().or(z.literal("")),
  minPerOrder: perOrderLimit(1),
  maxPerOrder: perOrderLimit(10),
});

export const ticketTypeStep2Schema = ticketTypeStep2ObjectSchema.superRefine(
  (values, ctx) => {
    const free = isFreeTicketPrice(values.priceInput);
    if (!free && values.allowedBillingTypes.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedBillingTypes"],
        message: "Selecione ao menos um tipo de pagamento",
      });
    }
  },
);

export const ticketFieldConfigSchema = z.object({
  fieldId: z.string(),
  label: z.string(),
  type: z.string(),
  isSystem: z.boolean(),
  enabled: z.boolean(),
  required: z.boolean(),
});

export const ticketTypeStep3Schema = z.object({
  fieldConfigs: z.array(ticketFieldConfigSchema),
});

export const ticketTypeFormSchema = ticketTypeStep1Schema
  .merge(ticketTypeStep2ObjectSchema)
  .merge(ticketTypeStep3Schema)
  .superRefine((values, ctx) => {
    const free = isFreeTicketPrice(values.priceInput);
    if (!free && values.allowedBillingTypes.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedBillingTypes"],
        message: "Selecione ao menos um tipo de pagamento",
      });
    }
    // Taxa só é usada (e mostrada) em ingresso pago.
    if (!free && values.feeInput?.trim() && parseMoneyToCents(values.feeInput) == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feeInput"],
        message: "Taxa inválida",
      });
    }
    if (
      values.salesOpensAt?.trim() &&
      values.salesClosesAt?.trim() &&
      !isSalesCloseAfterOpen(values.salesOpensAt, values.salesClosesAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salesClosesAt"],
        message: "O fim das vendas deve ser posterior ao início",
      });
    }
    if (values.minPerOrder > values.maxPerOrder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minPerOrder"],
        message: "O mínimo por pedido não pode ser maior que o máximo",
      });
    }
  });

export type TicketTypeFormValues = z.infer<typeof ticketTypeFormSchema>;
export type TicketFieldConfigValue = z.infer<typeof ticketFieldConfigSchema>;
