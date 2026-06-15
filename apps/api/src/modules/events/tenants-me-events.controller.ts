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
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('admin/tenants/me/events')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.events.listForTenant(user.tenantId) };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.getForTenant(user.tenantId, id);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.removeForTenant(user.tenantId, id);
  }
}
