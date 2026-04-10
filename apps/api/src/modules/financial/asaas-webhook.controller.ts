import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AsaasWebhookService } from './asaas-webhook.service';
import { TenantsService } from '../tenants/tenants.service';

@Controller('webhooks/asaas/:slug')
@SkipThrottle({ public: true, links: true })
export class AsaasWebhookController {
  constructor(
    private readonly webhook: AsaasWebhookService,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Configurar no painel Asaas o mesmo token da igreja (salvo cifrado no tenant).
   * Header: `asaas-access-token` (API Asaas v3).
   */
  @Post()
  async handle(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Headers('asaas-access-token') asaasAccessToken: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    this.webhook.verifyToken(asaasAccessToken, tenant.asaasWebhookToken);
    await this.webhook.processRawBody(body, idempotencyKey, tenant);
    return { received: true };
  }
}
