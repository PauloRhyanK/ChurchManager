import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantsService } from '../tenants/tenants.service';
import { ProjectionService } from './projection.service';

/** Rate limit: só o throttler `public` (30/min por IP). */
@Controller('public/tenants')
@SkipThrottle({ links: true, platform: true })
export class PublicProjectionController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly projection: ProjectionService,
  ) {}

  /** Eventos + programação semanal dos próximos dias, só o que vai para o telão. */
  @Get(':slug/projection-agenda')
  async agenda(@Param('slug') slug: string) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.projection.getPublicAgenda(tenant.id);
  }
}
