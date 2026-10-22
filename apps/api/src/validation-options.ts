import type { ValidationPipeOptions } from '@nestjs/common';

/** Opções do ValidationPipe global (main.ts); os specs de DTO usam as mesmas. */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};
