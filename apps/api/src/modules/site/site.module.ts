import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PublicSiteContentController } from './public-site-content.controller';
import { SiteContentService } from './site-content.service';
import { SiteRevalidationModule } from './site-revalidation.module';
import { TenantsMeSiteContentController } from './tenants-me-site-content.controller';

@Module({
  imports: [TenantsModule, AuthModule, AccessModule, SiteRevalidationModule],
  controllers: [TenantsMeSiteContentController, PublicSiteContentController],
  providers: [SiteContentService],
  exports: [SiteContentService, SiteRevalidationModule],
})
export class SiteModule {}
