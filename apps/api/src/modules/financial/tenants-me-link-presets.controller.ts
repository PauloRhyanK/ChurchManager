import {
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
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { CreateLinkPresetDto } from './dto/create-link-preset.dto';
import { UpdateLinkPresetDto } from './dto/update-link-preset.dto';
import { PaymentLinkPresetsService } from './payment-link-presets.service';

@Controller('admin/tenants/me/link-presets')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.FINANCIAL, PermissionLevel.VIEW)
export class TenantsMeLinkPresetsController {
  constructor(private readonly presets: PaymentLinkPresetsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.presets.listForTenant(user.tenantId) };
  }

  @Post()
  @RequirePermission(PermissionModule.FINANCIAL, PermissionLevel.EDIT)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateLinkPresetDto) {
    return this.presets.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.FINANCIAL, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLinkPresetDto,
  ) {
    return this.presets.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.FINANCIAL, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.presets.removeForTenant(user.tenantId, id);
  }
}
