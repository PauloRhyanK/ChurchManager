import { z } from "zod";

export const ticketTypeFormSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(255),
  description: z.string().max(5000).optional().or(z.literal("")),
  priceInput: z.string().min(1, "Preço obrigatório"),
  feeInput: z.string().optional().or(z.literal("")),
  quantityTotal: z.string().optional().or(z.literal("")),
  minPerOrder: z.coerce.number().int().min(1).max(100).default(1),
  maxPerOrder: z.coerce.number().int().min(1).max(100).default(10),
  active: z.boolean(),
});

export type TicketTypeFormValues = z.infer<typeof ticketTypeFormSchema>;
