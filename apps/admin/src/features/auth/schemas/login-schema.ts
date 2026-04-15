import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Introduza a palavra-passe"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
