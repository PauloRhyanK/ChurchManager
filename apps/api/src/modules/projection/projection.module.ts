import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { SiteRevalidationModule } from '../site/site-revalidation.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ProjectionService } from './projection.service';
import { PublicProjectionController } from './public-projection.controller';
import { TenantsMeProjectionController } from './tenants-me-projection.controller';

@Module({
  imports: [TenantsModule, AuthModule, AccessModule, SiteRevalidationModule],
  controllers: [TenantsMeProjectionController, PublicProjectionController],
  providers: [ProjectionService],
})
export class ProjectionModule {}
