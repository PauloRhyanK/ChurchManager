import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CreatePublicWebOriginDto } from './dto/create-public-web-origin.dto';
import { UpdateAsaasCredentialsDto } from './dto/update-asaas-credentials.dto';
import { UpdatePaymentSuccessRedirectDto } from './dto/update-payment-success-redirect.dto';
import { TenantCredentialsService } from './tenant-credentials.service';
import { TenantPublicWebOriginService } from './tenant-public-web-origin.service';
import { successUrlAllowedByPublicOrigins } from './public-web-origin.util';

@Controller('admin/tenants/me')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'))
export class TenantsMeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: TenantCredentialsService,
    private readonly publicWebOrigins: TenantPublicWebOriginService,
  ) {}

  @Get('financial-setup')
  async getFinancialSetup(@CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        asaasApiKey: true,
        asaasWebhookToken: true,
        paymentSuccessRedirectUrl: true,
      },
    });
    const isAsaasConfigured = Boolean(
      tenant?.asaasApiKey && tenant?.asaasWebhookToken,
    );
    return {
      isAsaasConfigured,
      paymentSuccessRedirectUrl: tenant?.paymentSuccessRedirectUrl ?? null,
    };
  }

  @Put('payment-success-redirect')
  async updatePaymentSuccessRedirect(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePaymentSuccessRedirectDto,
  ) {
    if (dto.paymentSuccessRedirectUrl === undefined) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { paymentSuccessRedirectUrl: true },
      });
      return {
        ok: true,
        paymentSuccessRedirectUrl: tenant?.paymentSuccessRedirectUrl ?? null,
      };
    }
    const next =
      dto.paymentSuccessRedirectUrl === null
        ? null
        : dto.paymentSuccessRedirectUrl.trim() === ''
          ? null
          : dto.paymentSuccessRedirectUrl.trim();
    if (next !== null) {
      const origins = await this.publicWebOrigins.listForTenant(user.tenantId);
      const allowed = origins.map((o) => o.origin);
      if (!successUrlAllowedByPublicOrigins(next, allowed)) {
        throw new BadRequestException(
          'O URL de retorno deve usar HTTPS (ou http em localhost) e o origin deve estar nas origens públicas registadas.',
        );
      }
    }
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { paymentSuccessRedirectUrl: next },
    });
    return { ok: true, paymentSuccessRedirectUrl: next };
  }

  @Put('asaas-credentials')
  async updateAsaasCredentials(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAsaasCredentialsDto,
  ) {
    await this.credentials.updateAsaasCredentials(user.tenantId, dto);
    return { ok: true };
  }

  @Get('public-web-origins')
  async listPublicWebOrigins(@CurrentUser() user: AuthUser) {
    const items = await this.publicWebOrigins.listForTenant(user.tenantId);
    return { items };
  }

  @Post('public-web-origins')
  async createPublicWebOrigin(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePublicWebOriginDto,
  ) {
    const row = await this.publicWebOrigins.createForTenant(
      user.tenantId,
      user.tenantSlug,
      dto.origin,
    );
    return row;
  }

  @Delete('public-web-origins/:id')
  async deletePublicWebOrigin(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.publicWebOrigins.deleteForTenant(
      user.tenantId,
      user.tenantSlug,
      id,
    );
    return { ok: true };
  }
}
