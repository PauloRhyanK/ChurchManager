import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { UpdateAsaasCredentialsDto } from './dto/update-asaas-credentials.dto';
import { TenantCredentialsService } from './tenant-credentials.service';

@Controller('admin/tenants/me')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'))
export class TenantsMeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: TenantCredentialsService,
  ) {}

  @Get('financial-setup')
  async getFinancialSetup(@CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { asaasApiKey: true, asaasWebhookToken: true },
    });
    const isAsaasConfigured = Boolean(
      tenant?.asaasApiKey && tenant?.asaasWebhookToken,
    );
    return { isAsaasConfigured };
  }

  @Put('asaas-credentials')
  async updateAsaasCredentials(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAsaasCredentialsDto,
  ) {
    await this.credentials.updateAsaasCredentials(user.tenantId, dto);
    return { ok: true };
  }
}
