import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { EventTagsService } from './event-tags.service';

class CreateEventTagDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;
}

@Controller('admin/tenants/me/event-tags')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.EVENTS, PermissionLevel.VIEW)
export class TenantsMeEventTagsController {
  constructor(private readonly tags: EventTagsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.tags.listForTenant(user.tenantId) };
  }

  @Post()
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventTagDto) {
    return this.tags.createForTenant(user.tenantId, dto.name);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tags.removeForTenant(user.tenantId, id);
  }
}
