import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  assertPublicPaymentSuccessUrlAllowed,
  resolveEffectivePaymentSuccessUrl,
} from '../tenants/public-web-origin.util';
import { TenantPublicWebOriginService } from '../tenants/tenant-public-web-origin.service';
import { TenantsService } from '../tenants/tenants.service';
import { ContributorAccessService } from './contributor-access.service';
import {
  CreateContributorSessionDto,
  RequestContributorAccessLinkDto,
} from './dto/contributor-access.dto';
import { PayerProfilesService } from './payer-profiles.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentLinksOrchestratorService } from './payment-links-orchestrator.service';
import { CreatePayerProfileDto } from './dto/create-payer-profile.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { CreatePublicPaymentLinkDto } from './dto/create-public-payment-link.dto';

@Controller('public/tenants')
@SkipThrottle({ links: true, platform: true })
export class PublicFinancialController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly payerProfiles: PayerProfilesService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly paymentLinksOrchestrator: PaymentLinksOrchestratorService,
    private readonly publicWebOrigins: TenantPublicWebOriginService,
    private readonly contributorAccess: ContributorAccessService,
  ) {}

  @Post(':slug/payer-profiles')
  async upsertPayerProfile(
    @Param('slug') slug: string,
    @Body() dto: CreatePayerProfileDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const profile = await this.payerProfiles.upsertForTenant(tenant.id, dto);
    return {
      id: profile.id,
      updatedAt: profile.updatedAt,
    };
  }

  @Post(':slug/payment-intents')
  async createPaymentIntent(
    @Param('slug') slug: string,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const allowed = await this.publicWebOrigins.getAllowedOriginsForSlug(slug);
    const effectiveSuccessUrl = resolveEffectivePaymentSuccessUrl(
      dto.successUrl,
      tenant.paymentSuccessRedirectEnabled !== false
        ? tenant.paymentSuccessRedirectUrl
        : null,
    );
    assertPublicPaymentSuccessUrlAllowed(
      effectiveSuccessUrl,
      dto.autoRedirect,
      allowed,
    );
    return this.paymentIntents.createIntent(tenant, {
      ...dto,
      successUrl: effectiveSuccessUrl,
    });
  }

  /** Gera link de pagamento Asaas (cota única ou mensal). Rate limit: throttler `links` (20/min/IP). */
  @Post(':slug/links')
  @HttpCode(201)
  @SkipThrottle({ links: false })
  @Throttle({ links: { limit: 5, ttl: 60_000 } })
  async createPublicPaymentLink(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicPaymentLinkDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const allowed = await this.publicWebOrigins.getAllowedOriginsForSlug(slug);
    const effectiveSuccessUrl = resolveEffectivePaymentSuccessUrl(
      dto.successUrl,
      tenant.paymentSuccessRedirectEnabled !== false
        ? tenant.paymentSuccessRedirectUrl
        : null,
    );
    assertPublicPaymentSuccessUrlAllowed(
      effectiveSuccessUrl,
      dto.autoRedirect,
      allowed,
    );
    return this.paymentLinksOrchestrator.createOrReusePublicCotasLink(tenant, {
      reuseMode: dto.reuseMode,
      presetKey: dto.presetKey,
      cpf: dto.cpf,
      name: dto.name,
      isMonthly: dto.isMonthly,
      value: dto.value,
      subscriptionDurationMonths: dto.subscriptionDurationMonths,
      successUrl: effectiveSuccessUrl,
      autoRedirect: dto.autoRedirect,
      confirmAdditional: dto.confirmAdditional,
    });
  }

  /**
   * "Minhas contribuições": envia link mágico ao e-mail do perfil do CPF.
   * Sempre 202 `{ sent: true }` (não revela se o CPF existe). 3/min/IP.
   */
  @Post(':slug/contributions/access-link')
  @HttpCode(202)
  @Throttle({ public: { limit: 3, ttl: 60_000 } })
  async requestContributorAccessLink(
    @Param('slug') slug: string,
    @Body() dto: RequestContributorAccessLinkDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const allowed = await this.publicWebOrigins.getAllowedOriginsForSlug(slug);
    return this.contributorAccess.requestAccessLink(
      tenant,
      { cpf: dto.cpf, returnUrl: dto.returnUrl },
      allowed,
    );
  }

  /** Troca o token do e-mail por sessão JWT (30 dias). Inválido → 401 `INVALID_TOKEN`. */
  @Post(':slug/contributions/session')
  @HttpCode(200)
  @Throttle({ public: { limit: 10, ttl: 60_000 } })
  async createContributorSession(
    @Param('slug') slug: string,
    @Body() dto: CreateContributorSessionDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.contributorAccess.createSession(tenant, dto.token);
  }

  /** Resumo só leitura do contribuidor. `Authorization: Bearer <sessionToken>`. */
  @Get(':slug/contributions/me')
  @Throttle({ public: { limit: 30, ttl: 60_000 } })
  async getContributorSummary(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.contributorAccess.getMe(tenant, authorization);
  }
}
