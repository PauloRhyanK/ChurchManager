import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantCredentialsService } from './tenant-credentials.service';
import { TenantPublicWebOriginService } from './tenant-public-web-origin.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { TenantsMeController } from './tenants-me.controller';
import { TenantsMePublicSiteController } from './tenants-me-public-site.controller';
import { CryptoService } from '../../common/crypto.service';
import { AsaasClient } from '../financial/asaas/asaas.client';
import { AuthModule } from '../auth/auth.module';
import { AccessModule } from '../access/access.module';
import { SiteRevalidationModule } from '../site/site-revalidation.module';

@Module({
  imports: [AuthModule, AccessModule, SiteRevalidationModule],
  controllers: [
    TenantsMeController,
    TenantsMePublicSiteController,
    PlatformTenantsController,
  ],
  providers: [
    TenantsService,
    TenantCredentialsService,
    TenantPublicWebOriginService,
    CryptoService,
    AsaasClient,
  ],
  exports: [
    TenantsService,
    TenantCredentialsService,
    TenantPublicWebOriginService,
  ],
})
export class TenantsModule {}
