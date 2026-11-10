import { z } from "zod";
import { parseMoneyToCents } from "@/features/events/lib/format";

export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Código obrigatório")
      .max(32, "Máximo de 32 caracteres")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Use apenas letras, números, hífen ou sublinhado",
      )
      .transform((v) => v.toUpperCase()),
    name: z.string().max(255, "Máximo de 255 caracteres").optional().or(z.literal("")),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountPercentage: z.coerce
      .number()
      .min(1, "Mínimo de 1%")
      .max(100, "Máximo de 100%")
      .optional(),
    discountMoney: z.string().optional().or(z.literal("")),
    restrictionType: z.enum(["ALL", "SELECTED"]).default("ALL"),
    selectedTicketTypeIds: z.array(z.string()).default([]),
    maxUses: z.string().optional().or(z.literal("")),
    maxUsesPerCpf: z.string().default("1"),
    validFrom: z.string().optional().or(z.literal("")),
    validUntil: z.string().optional().or(z.literal("")),
    active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "PERCENTAGE") {
      if (
        data.discountPercentage === undefined ||
        isNaN(data.discountPercentage) ||
        data.discountPercentage < 1 ||
        data.discountPercentage > 100
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe uma porcentagem entre 1% e 100%",
          path: ["discountPercentage"],
        });
      }
    } else if (data.discountType === "FIXED") {
      const cents = parseMoneyToCents(data.discountMoney ?? "");
      if (cents <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe um valor fixo maior que zero",
          path: ["discountMoney"],
        });
      }
    }

    if (
      data.restrictionType === "SELECTED" &&
      data.selectedTicketTypeIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione ao menos um tipo de ingresso",
        path: ["selectedTicketTypeIds"],
      });
    }

    if (data.validFrom && data.validUntil) {
      if (new Date(data.validFrom) > new Date(data.validUntil)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Data de término deve ser posterior à de início",
          path: ["validUntil"],
        });
      }
    }
  });

export type CouponFormData = z.infer<typeof couponFormSchema>;
