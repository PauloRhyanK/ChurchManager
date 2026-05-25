import { Module } from '@nestjs/common';
import { CryptoService } from '../common/crypto.service';
import { AsaasClient } from '../modules/financial/asaas/asaas.client';
import { AsaasSubscriptionDurationSyncService } from '../modules/financial/asaas-subscription-duration-sync.service';
import { TenantCredentialsService } from '../modules/tenants/tenant-credentials.service';

/** Providers financeiros/Asaas sem HTTP, auth nem throttling — para scripts CLI. */
@Module({
  providers: [
    CryptoService,
    AsaasClient,
    TenantCredentialsService,
    AsaasSubscriptionDurationSyncService,
  ],
  exports: [
    AsaasClient,
    TenantCredentialsService,
    AsaasSubscriptionDurationSyncService,
  ],
})
export class ScriptsFinancialModule {}
