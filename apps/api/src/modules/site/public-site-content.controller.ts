import { Controller, Get, Param } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { SiteContentService } from './site-content.service';

@Controller('public/tenants')
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
