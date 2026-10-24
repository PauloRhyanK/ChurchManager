import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateProjectionSettingsDto } from './dto/update-projection-settings.dto';
import { ProjectionService } from './projection.service';

/** Agenda do telão (`/projecao-agenda` no site), configurada na aba Site. */
@Controller('admin/tenants/me/projection')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.SITE, PermissionLevel.VIEW)
export class TenantsMeProjectionController {
  constructor(private readonly projection: ProjectionService) {}

  @Get('agenda')
  async getAgenda(@CurrentUser() user: AuthUser) {
    return this.projection.getAgendaForTenant(user.tenantId);
  }

  @Put('settings')
  @RequirePermission(PermissionModule.SITE, PermissionLevel.EDIT)
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProjectionSettingsDto,
  ) {
    return this.projection.updateSettingsForTenant(user.tenantId, dto);
  }
}
