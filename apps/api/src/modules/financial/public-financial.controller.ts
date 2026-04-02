import { Body, Controller, Param, Post } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { PayerProfilesService } from './payer-profiles.service';
import { PaymentIntentsService } from './payment-intents.service';
import { CreatePayerProfileDto } from './dto/create-payer-profile.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';

@Controller('public/tenants')
export class PublicFinancialController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly payerProfiles: PayerProfilesService,
    private readonly paymentIntents: PaymentIntentsService,
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
    return this.paymentIntents.createIntent(tenant.id, dto);
  }
}
