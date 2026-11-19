import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Limite do corpo JSON. O padrão do Nest (100 kB) fica muito abaixo do que o validador das palavras aceita
 * (300.000 caracteres de texto, mais a estrutura do documento). Nenhuma rota usa o corpo cru.
 */
export const JSON_BODY_LIMIT = '2mb';

export function applyBodyLimits(app: NestExpressApplication): void {
  // Registrado antes do `listen`: o Nest vê o parser de JSON já aplicado e não põe o padrão por cima.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
