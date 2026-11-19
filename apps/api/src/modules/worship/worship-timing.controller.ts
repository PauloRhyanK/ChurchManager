import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { TimingCorrectionDto, TimingSettingsDto, TimingSuggestDto } from './dto/timing.dto';
import { WorshipTimingService } from './worship-timing.service';

/** Cultos › tempos dos slides: antecipação, ajuste por instrução e o histórico de correções. */
@Controller('admin/tenants/me/worship/timing')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.WORSHIP, PermissionLevel.VIEW)
export class WorshipTimingController {
  constructor(private readonly timing: WorshipTimingService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.timing.settings(user.tenantId);
  }

  @Put('settings')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  setSettings(@CurrentUser() user: AuthUser, @Body() dto: TimingSettingsDto) {
    return this.timing.setSettings(user.tenantId, dto);
  }

  @Get('learned')
  learned(@CurrentUser() user: AuthUser) {
    return this.timing.learned(user.tenantId);
  }

  @Post('songs/:id/suggest')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  suggest(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TimingSuggestDto) {
    return this.timing.suggest(user.tenantId, user.userId, id, dto);
  }

  @Post('songs/:id/corrections')
  @HttpCode(200)
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  record(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TimingCorrectionDto) {
    return this.timing.recordCorrection(user.tenantId, id, dto);
  }
}
