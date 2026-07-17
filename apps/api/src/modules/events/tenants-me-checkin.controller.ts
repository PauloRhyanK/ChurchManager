import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { CheckinService } from './checkin.service';
import { EventRegistrationsService } from './event-registrations.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { IssueFreeTicketsDto } from './dto/checkin-issue-free-tickets.dto';

@Controller('admin/tenants/me/checkin')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.CHECKIN, PermissionLevel.VIEW)
export class TenantsMeCheckinController {
  constructor(
    private readonly checkin: CheckinService,
    private readonly registrations: EventRegistrationsService,
  ) {}

  @Get('events')
  async listEvents(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
  ) {
    const parsed = scope === 'all' ? 'all' : 'today';
    return { items: await this.checkin.listEvents(user.tenantId, parsed) };
  }

  @Get('events/:eventId/ticket-types')
  async listEventTicketTypes(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.checkin.listEventTicketTypes(user.tenantId, eventId);
  }

  @Get('events/:eventId/tickets')
  async listEventTickets(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('search') search?: string,
  ) {
    return this.checkin.listEventTickets(user.tenantId, eventId, search);
  }

  @Get('tickets/lookup')
  async lookup(@CurrentUser() user: AuthUser, @Query('code') code: string) {
    return this.checkin.lookupByCode(user.tenantId, code);
  }

  @Post('tickets/:ticketId/checkin')
  @RequirePermission(PermissionModule.CHECKIN, PermissionLevel.EDIT)
  async doCheckIn(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
  ) {
    return this.checkin.checkIn(user.tenantId, ticketId, {
      userId: user.userId,
      email: user.email,
    });
  }

  @Post('tickets/:ticketId/undo')
  @RequirePermission(PermissionModule.CHECKIN, PermissionLevel.EDIT)
  async undoCheckIn(
    @CurrentUser() user: AuthUser,
    @Param('ticketId') ticketId: string,
  ) {
    return this.checkin.undoCheckIn(user.tenantId, ticketId);
  }

  @Post('events/:eventId/registrations')
  @RequirePermission(PermissionModule.CHECKIN, PermissionLevel.EDIT)
  async createRegistration(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventRegistrationDto,
  ) {
    return this.registrations.createForEvent(user.tenantId, eventId, dto);
  }

  @Post('events/:eventId/issue-free-tickets')
  @RequirePermission(PermissionModule.CHECKIN, PermissionLevel.EDIT)
  async issueFreeTickets(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: IssueFreeTicketsDto,
  ) {
    return this.checkin.issueFreeTickets(user.tenantId, eventId, dto);
  }
}
