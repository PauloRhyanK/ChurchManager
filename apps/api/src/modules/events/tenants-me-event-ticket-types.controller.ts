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
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CreateEventTicketTypeDto } from './dto/create-event-ticket-type.dto';
import { UpdateEventTicketTypeDto } from './dto/update-event-ticket-type.dto';
import { EventTicketTypesService } from './event-ticket-types.service';

@Controller('admin/tenants/me/events/:eventId/ticket-types')
@UseGuards(AuthGuard('jwt'))
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
  async create(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventTicketTypeDto,
  ) {
    return this.ticketTypes.createForEvent(user.tenantId, eventId, dto);
  }

  @Post(':id/duplicate')
  async duplicate(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ticketTypes.duplicateForEvent(user.tenantId, eventId, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventTicketTypeDto,
  ) {
    return this.ticketTypes.updateForEvent(user.tenantId, eventId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ticketTypes.removeForEvent(user.tenantId, eventId, id);
  }
}
