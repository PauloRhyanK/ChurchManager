import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { InviteUserDto, UpdateUserDto } from './dto/tenant-user.dto';
import { InvitationsService } from './invitations.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { TenantUsersService } from './tenant-users.service';

@Controller('admin/tenants/me/users')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class TenantsMeUsersController {
  constructor(
    private readonly users: TenantUsersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  @RequirePermission(PermissionModule.USERS, PermissionLevel.VIEW)
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.users.listForTenant(user.tenantId) };
  }

  @Get('pending')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.VIEW)
  async listPending(@CurrentUser() user: AuthUser) {
    return { items: await this.users.listPendingForTenant(user.tenantId) };
  }

  @Post('invite')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.invitations.createInvite(user.tenantId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.updateForTenant(user.tenantId, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.approve(user.tenantId, id);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.remove(user.tenantId, id, user.userId);
  }
}
