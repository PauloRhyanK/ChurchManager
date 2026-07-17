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
import { CreateEventTicketTypeDto } from './dto/create-event-ticket-type.dto';
import { UpdateEventTicketTypeDto } from './dto/update-event-ticket-type.dto';
import { EventTicketTypesService } from './event-ticket-types.service';

@Controller('admin/tenants/me/events/:eventId/ticket-types')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.VIEW)
export class TenantsMeEventTicketTypesController {
  constructor(private readonly ticketTypes: EventTicketTypesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return {
      items: await this.ticketTypes.listForEvent(user.tenantId, eventId),
    };
  }

  @Post()
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async create(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventTicketTypeDto,
  ) {
    return this.ticketTypes.createForEvent(user.tenantId, eventId, dto);
  }

  @Post(':id/duplicate')
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async duplicate(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ticketTypes.duplicateForEvent(user.tenantId, eventId, id);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventTicketTypeDto,
  ) {
    return this.ticketTypes.updateForEvent(user.tenantId, eventId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.EVENT_TICKETS, PermissionLevel.EDIT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ticketTypes.removeForEvent(user.tenantId, eventId, id);
  }
}
