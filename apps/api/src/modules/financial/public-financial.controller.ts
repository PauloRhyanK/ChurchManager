import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TenantsService } from '../tenants/tenants.service';
import { PayerProfilesService } from './payer-profiles.service';
import { PaymentIntentsService } from './payment-intents.service';
import {
  PAYMENT_LINK_SOURCE_COTAS,
  PaymentLinksGenerationService,
} from './payment-links-generation.service';
import { CreatePayerProfileDto } from './dto/create-payer-profile.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { CreatePublicPaymentLinkDto } from './dto/create-public-payment-link.dto';

@Controller('public/tenants')
@SkipThrottle({ links: true })
export class PublicFinancialController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly payerProfiles: PayerProfilesService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly paymentLinksGeneration: PaymentLinksGenerationService,
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
    return this.paymentIntents.createIntent(tenant, dto);
  }

  /** Gera link de pagamento Asaas (cota única ou mensal). Rate limit: throttler `links` (5/min/IP). */
  @Post(':slug/links')
  @HttpCode(201)
  @SkipThrottle({ links: false })
  @Throttle({ links: { limit: 5, ttl: 60_000 } })
  async createPublicPaymentLink(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicPaymentLinkDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.paymentLinksGeneration.create(tenant, {
      isMonthly: dto.isMonthly,
      value: dto.value,
      sourceKey: PAYMENT_LINK_SOURCE_COTAS,
      asaasLinkName: `Cotas — ${tenant.name}`,
    });
  }
}
