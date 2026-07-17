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
  CreateSignupLinkDto,
  UpdateSignupLinkDto,
} from './dto/signup-link.dto';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { SignupLinksService } from './signup-links.service';

@Controller('admin/tenants/me/signup-links')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class TenantsMeSignupLinksController {
  constructor(private readonly links: SignupLinksService) {}

  @Get()
  @RequirePermission(PermissionModule.USERS, PermissionLevel.VIEW)
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.links.listForTenant(user.tenantId) };
  }

  @Post()
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSignupLinkDto,
  ) {
    return this.links.createForTenant(user.tenantId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSignupLinkDto,
  ) {
    return this.links.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.USERS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.links.removeForTenant(user.tenantId, id);
  }
}
