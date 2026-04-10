import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantCredentialsService } from './tenant-credentials.service';
import { TenantsMeController } from './tenants-me.controller';
import { CryptoService } from '../../common/crypto.service';
import { AsaasClient } from '../financial/asaas/asaas.client';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TenantsMeController],
  providers: [TenantsService, TenantCredentialsService, CryptoService, AsaasClient],
  exports: [TenantsService, TenantCredentialsService],
})
export class TenantsModule {}
