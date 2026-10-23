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
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { MinistriesService } from './ministries.service';

@Controller('admin/tenants/me/ministries')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.CHURCH, PermissionLevel.VIEW)
export class MinistriesController {
  constructor(private readonly ministries: MinistriesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.ministries.listForTenant(user.tenantId) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ministries.getForTenant(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateMinistryDto) {
    return this.ministries.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMinistryDto,
  ) {
    return this.ministries.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ministries.removeForTenant(user.tenantId, id);
  }
}
