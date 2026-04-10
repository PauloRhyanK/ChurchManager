import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { AsaasClient } from './asaas/asaas.client';
import { PayerProfilesService } from './payer-profiles.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentLinksGenerationService } from './payment-links-generation.service';
import { PublicFinancialController } from './public-financial.controller';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasWebhookService } from './asaas-webhook.service';
import { CotasOverviewService } from './cotas-overview.service';
import { TenantsMeCotasController } from './tenants-me-cotas.controller';

@Module({
  imports: [TenantsModule, AuthModule],
  controllers: [
    PublicFinancialController,
    AsaasWebhookController,
    TenantsMeCotasController,
  ],
  providers: [
    AsaasClient,
    PayerProfilesService,
    PaymentIntentsService,
    PaymentLinksGenerationService,
    AsaasWebhookService,
    CotasOverviewService,
  ],
})
export class FinancialModule {}
