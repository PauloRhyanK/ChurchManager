import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantCredentialsService } from './tenant-credentials.service';
import { TenantPublicWebOriginService } from './tenant-public-web-origin.service';
import { TenantsMeController } from './tenants-me.controller';
import { CryptoService } from '../../common/crypto.service';
import { AsaasClient } from '../financial/asaas/asaas.client';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TenantsMeController],
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
