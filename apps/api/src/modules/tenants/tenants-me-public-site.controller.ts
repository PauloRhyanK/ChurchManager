import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { SiteRevalidationService } from '../site/site-revalidation.service';
import { firstPublicHttpsOrigin } from './public-web-origin.util';
import { TenantPublicWebOriginService } from './tenant-public-web-origin.service';

/**
 * Endereço público do site do tenant, para o painel montar links como
 * "Ver no site" (`${publicSiteUrl}/evento/${id}`). Só JWT, sem permissão de
 * módulo: qualquer utilizador do painel pode precisar do link (o
 * TenantsMeController, no mesmo prefixo, exige SETTINGS em todas as rotas).
 */
@Controller('admin/tenants/me')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'))
export class TenantsMePublicSiteController {
  constructor(
    private readonly publicWebOrigins: TenantPublicWebOriginService,
    private readonly siteRevalidation: SiteRevalidationService,
  ) {}

  /**
   * Mesma origem que recebe a revalidação do site (SITE_REVALIDATION_TARGETS);
   * sem ela, a primeira origem pública `https://` registada; senão `null`.
   */
  @Get('public-site')
  async getPublicSite(
    @CurrentUser() user: AuthUser,
  ): Promise<{ publicSiteUrl: string | null }> {
    const [revalidationTarget] = this.siteRevalidation.originsForTenantSlug(
      user.tenantSlug,
    );
    if (revalidationTarget) {
      return { publicSiteUrl: revalidationTarget };
    }
    const origins = await this.publicWebOrigins.listForTenant(user.tenantId);
    return {
      publicSiteUrl: firstPublicHttpsOrigin(origins.map((o) => o.origin)),
    };
  }
}
