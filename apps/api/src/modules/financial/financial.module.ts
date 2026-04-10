import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AsaasClient } from './asaas/asaas.client';
import { PayerProfilesService } from './payer-profiles.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentLinksGenerationService } from './payment-links-generation.service';
import { PublicFinancialController } from './public-financial.controller';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasWebhookService } from './asaas-webhook.service';

@Module({
  imports: [TenantsModule],
  controllers: [PublicFinancialController, AsaasWebhookController],
  providers: [
    AsaasClient,
    PayerProfilesService,
    PaymentIntentsService,
    PaymentLinksGenerationService,
    AsaasWebhookService,
  ],
})
export class FinancialModule {}
