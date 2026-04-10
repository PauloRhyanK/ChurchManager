import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantCredentialsService } from './tenant-credentials.service';
import { TenantsAdminController } from './tenants-admin.controller';
import { CryptoService } from '../../common/crypto.service';
import { AsaasClient } from '../financial/asaas/asaas.client';

@Module({
  controllers: [TenantsAdminController],
  providers: [TenantsService, TenantCredentialsService, CryptoService, AsaasClient],
  exports: [TenantsService, TenantCredentialsService],
})
export class TenantsModule {}
