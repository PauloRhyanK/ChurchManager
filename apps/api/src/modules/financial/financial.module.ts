import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { AsaasClient } from './asaas/asaas.client';
import { PayerProfilesService } from './payer-profiles.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentLinksGenerationService } from './payment-links-generation.service';
import { PaymentLinksOrchestratorService } from './payment-links-orchestrator.service';
import { PaymentLinkPresetsService } from './payment-link-presets.service';
import { PublicFinancialController } from './public-financial.controller';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { AsaasWebhookService } from './asaas-webhook.service';
import { AsaasSubscriptionDurationSyncService } from './asaas-subscription-duration-sync.service';
import { CotasOverviewService } from './cotas-overview.service';
import { TenantsMeCotasController } from './tenants-me-cotas.controller';
import { TenantsMeLinkPresetsController } from './tenants-me-link-presets.controller';
import { TenantsMeEventsPaymentLinksController } from './tenants-me-events-payment-links.controller';

@Module({
  imports: [TenantsModule, AuthModule],
  controllers: [
    PublicFinancialController,
    AsaasWebhookController,
    TenantsMeCotasController,
    TenantsMeLinkPresetsController,
    TenantsMeEventsPaymentLinksController,
  ],
  providers: [
    AsaasClient,
    PayerProfilesService,
    PaymentIntentsService,
    PaymentLinksGenerationService,
    PaymentLinksOrchestratorService,
    PaymentLinkPresetsService,
    AsaasWebhookService,
    AsaasSubscriptionDurationSyncService,
    CotasOverviewService,
  ],
})
export class FinancialModule {}
