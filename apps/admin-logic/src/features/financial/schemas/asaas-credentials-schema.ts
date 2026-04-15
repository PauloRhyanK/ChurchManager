import { z } from 'zod';

/** Alinhado com UpdateAsaasCredentialsDto no Nest (MinLength). */
export const asaasCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'Obrigatório').min(10, 'Mínimo 10 caracteres'),
  webhookToken: z
    .string()
    .min(1, 'Obrigatório')
    .min(8, 'Mínimo 8 caracteres'),
});

export type AsaasCredentialsFormValues = z.infer<typeof asaasCredentialsSchema>;
