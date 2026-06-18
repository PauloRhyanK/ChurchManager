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
import {
  CreateEventFieldDefinitionDto,
  UpdateEventFieldDefinitionDto,
} from './dto/event-field-definition.dto';
import { EventFieldDefinitionsService } from './event-field-definitions.service';

@Controller('admin/tenants/me/event-field-definitions')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeEventFieldsController {
  constructor(private readonly fields: EventFieldDefinitionsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.fields.listForTenant(user.tenantId) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEventFieldDefinitionDto,
  ) {
    return this.fields.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventFieldDefinitionDto,
  ) {
    return this.fields.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fields.removeForTenant(user.tenantId, id);
  }
}
