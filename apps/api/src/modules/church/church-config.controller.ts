import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { UpdateChurchConfigDto } from './dto/update-church-config.dto';
import { ChurchConfigService } from './church-config.service';

@Controller('admin/tenants/me/church-config')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.CHURCH, PermissionLevel.VIEW)
export class ChurchConfigController {
  constructor(private readonly configService: ChurchConfigService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return this.configService.getForTenant(user.tenantId);
  }

  @Put()
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateChurchConfigDto) {
    return this.configService.updateForTenant(user.tenantId, dto);
  }
}
