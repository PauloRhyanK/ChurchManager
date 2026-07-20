import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PublicSiteContentController } from './public-site-content.controller';
import { SiteContentService } from './site-content.service';
import { SiteRevalidationService } from './site-revalidation.service';
import { TenantsMeSiteContentController } from './tenants-me-site-content.controller';

@Module({
  imports: [TenantsModule, AuthModule, AccessModule],
  controllers: [TenantsMeSiteContentController, PublicSiteContentController],
  providers: [SiteContentService, SiteRevalidationService],
  exports: [SiteContentService],
})
export class SiteModule {}
