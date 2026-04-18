import { z } from "zod";

export const createPlatformTenantSchema = z.object({
  name: z.string().min(2, "Nome mínimo de 2 caracteres").max(255),
  slug: z.string().min(2, "Slug mínimo de 2 caracteres").max(100),
  adminEmail: z.string().email("E-mail inválido"),
  adminPassword: z
    .string()
    .min(8, "Palavra-passe do admin: mínimo 8 caracteres")
    .max(128),
});

export type CreatePlatformTenantFormValues = z.infer<typeof createPlatformTenantSchema>;
