import { Body, Controller, Headers, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AsaasWebhookService } from './asaas-webhook.service';

@Controller('webhooks/asaas')
@SkipThrottle()
export class AsaasWebhookController {
  constructor(private readonly webhook: AsaasWebhookService) {}

  /**
   * Configurar no painel Asaas o mesmo token que `ASAAS_WEBHOOK_TOKEN`.
   * Header: `asaas-access-token` (API Asaas v3).
   */
  @Post()
  async handle(
    @Body() body: unknown,
    @Headers('asaas-access-token') asaasAccessToken: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    this.webhook.verifyToken(asaasAccessToken);
    await this.webhook.processRawBody(body, idempotencyKey);
    return { received: true };
  }
}
