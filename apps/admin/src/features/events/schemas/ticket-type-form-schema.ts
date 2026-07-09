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

export const ticketTypeStep2Schema = z
  .object({
    allowedBillingTypes: z.array(z.enum(BILLING_TYPES)),
    maxInstallments: z.string().optional().or(z.literal("")),
    priceInput: z.string().min(1, "Preço obrigatório"),
    feeInput: z.string().optional().or(z.literal("")),
    quantityTotal: z.string().optional().or(z.literal("")),
    minPerOrder: z.coerce.number().int().min(1).max(100).default(1),
    maxPerOrder: z.coerce.number().int().min(1).max(100).default(10),
  })
  .superRefine((values, ctx) => {
    const free = isFreeTicketPrice(values.priceInput);
    if (!free && values.allowedBillingTypes.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedBillingTypes"],
        message: "Selecione ao menos um tipo de pagamento",
      });
    }
  });

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
  .merge(ticketTypeStep2Schema)
  .merge(ticketTypeStep3Schema)
  .superRefine((values, ctx) => {
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
  });

export type TicketTypeFormValues = z.infer<typeof ticketTypeFormSchema>;
export type TicketFieldConfigValue = z.infer<typeof ticketFieldConfigSchema>;
