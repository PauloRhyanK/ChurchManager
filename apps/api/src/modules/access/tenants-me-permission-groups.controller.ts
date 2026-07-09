import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import {
  CreatePermissionGroupDto,
  UpdatePermissionGroupDto,
} from './dto/permission-group.dto';
import { PermissionGroupsService } from './permission-groups.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';

@Controller('admin/tenants/me/permission-groups')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class TenantsMePermissionGroupsController {
  constructor(private readonly groups: PermissionGroupsService) {}

  @Get()
  @RequirePermission(PermissionModule.USERS, PermissionLevel.VIEW)
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.groups.listForTenant(user.tenantId) };
  }

  @Get(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.VIEW)
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groups.getForTenant(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePermissionGroupDto,
  ) {
    return this.groups.createForTenant(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionGroupDto,
  ) {
    return this.groups.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groups.removeForTenant(user.tenantId, id);
  }
}
