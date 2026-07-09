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
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { SchedulesService } from './schedules.service';

@Controller('admin/tenants/me/schedules')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.EVENTS, PermissionLevel.VIEW)
export class TenantsMeSchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.schedules.listForTenant(user.tenantId) };
  }

  @Post()
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateScheduleDto) {
    return this.schedules.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedules.removeForTenant(user.tenantId, id);
  }
}
