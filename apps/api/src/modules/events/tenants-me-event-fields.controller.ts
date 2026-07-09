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
import {
  CreateEventFieldDefinitionDto,
  UpdateEventFieldDefinitionDto,
} from './dto/event-field-definition.dto';
import { EventFieldDefinitionsService } from './event-field-definitions.service';

@Controller('admin/tenants/me/event-field-definitions')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.EVENTS, PermissionLevel.VIEW)
export class TenantsMeEventFieldsController {
  constructor(private readonly fields: EventFieldDefinitionsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.fields.listForTenant(user.tenantId) };
  }

  @Post()
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEventFieldDefinitionDto,
  ) {
    return this.fields.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventFieldDefinitionDto,
  ) {
    return this.fields.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.EVENTS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fields.removeForTenant(user.tenantId, id);
  }
}
