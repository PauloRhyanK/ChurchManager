import { z } from "zod";

const optionalSecret = (min: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value.length === 0 || value.length >= min, message);

export const asaasCredentialsSchema = z.object({
  apiKey: optionalSecret(10, "Mínimo 10 caracteres"),
  webhookToken: optionalSecret(8, "Mínimo 8 caracteres"),
}).refine((values) => values.apiKey.length > 0 || values.webhookToken.length > 0, {
  message: "Preencha pelo menos um campo",
  path: ["apiKey"],
});

export type AsaasCredentialsFormValues = z.infer<typeof asaasCredentialsSchema>;
