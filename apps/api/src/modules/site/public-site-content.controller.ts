import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantsService } from '../tenants/tenants.service';
import { SiteContentService } from './site-content.service';

/** Rate limit: só o throttler `public` (30/min por IP). */
@Controller('public/tenants')
@SkipThrottle({ links: true, platform: true })
export class PublicSiteContentController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly siteContent: SiteContentService,
  ) {}

  /** Todo o conteúdo editável do site, num único pedido. */
  @Get(':slug/site-content')
  async list(@Param('slug') slug: string) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return { sections: await this.siteContent.listPublicForTenant(tenant.id) };
  }
}
