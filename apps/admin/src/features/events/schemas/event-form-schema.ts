import { z } from "zod";

const timeOptional = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM")
  .optional()
  .or(z.literal(""));

export const eventFormSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório").max(255),
  description: z.string().max(10000).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  timeStart: timeOptional,
  timeEnd: timeOptional,
  location: z.string().max(255).optional().or(z.literal("")),
  imageUrl: z
    .string()
    .max(2048)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v === "" || /^https?:\/\/.+/i.test(v), "URL inválida"),
  tag: z.string().max(64).optional().or(z.literal("")),
  published: z.boolean(),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;

export function eventFormToApiBody(values: EventFormValues) {
  return {
    title: values.title.trim(),
    description: values.description?.trim() || null,
    date: values.date,
    timeStart: values.timeStart?.trim() || undefined,
    timeEnd: values.timeEnd?.trim() || undefined,
    location: values.location?.trim() || null,
    imageUrl: values.imageUrl?.trim() || null,
    tag: values.tag?.trim() || null,
    published: values.published,
  };
}
