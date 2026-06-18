import { z } from "zod";

const timeOptional = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM")
  .optional()
  .or(z.literal(""));

const urlOptional = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v === "" || /^https?:\/\/.+/i.test(v), "URL inválida");

export const eventFormSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(255),
  shortDescription: z.string().max(500).optional().or(z.literal("")),
  description: z.string().max(10000).optional().or(z.literal("")),
  detailsHtml: z.string().max(50000).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  timeStart: timeOptional,
  timeEnd: timeOptional,
  format: z.enum(["IN_PERSON", "ONLINE"]).default("IN_PERSON"),
  location: z.string().max(255).optional().or(z.literal("")),
  onlineUrl: urlOptional(2048),
  coverImageUrl: urlOptional(2048),
  videoUrl: urlOptional(2048),
  tags: z.array(z.string().trim().min(1).max(64)).default([]),
  published: z.boolean(),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

/** Step 1 do wizard de criação — apenas informações básicas. */
export const eventBasicSchema = eventFormSchema
  .pick({
    title: true,
    shortDescription: true,
    date: true,
    timeStart: true,
    timeEnd: true,
    format: true,
    location: true,
    onlineUrl: true,
    tags: true,
  })
  .superRefine((values, ctx) => {
    if (values.format === "ONLINE" && !values.onlineUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["onlineUrl"],
        message: "Informe o link de transmissão",
      });
    }
  });

export type EventBasicValues = z.infer<typeof eventBasicSchema>;

export function eventFormToApiBody(values: EventFormValues) {
  return {
    title: values.title.trim(),
    shortDescription: values.shortDescription?.trim() || null,
    description: values.description?.trim() || null,
    detailsHtml: values.detailsHtml?.trim() || null,
    date: values.date,
    timeStart: values.timeStart?.trim() || undefined,
    timeEnd: values.timeEnd?.trim() || undefined,
    format: values.format,
    location: values.format === "IN_PERSON" ? values.location?.trim() || null : null,
    onlineUrl: values.format === "ONLINE" ? values.onlineUrl?.trim() || null : null,
    coverImageUrl: values.coverImageUrl?.trim() || null,
    videoUrl: values.videoUrl?.trim() || null,
    tags: values.tags ?? [],
    published: values.published,
  };
}
