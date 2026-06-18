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
import { IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { EventTagsService } from './event-tags.service';

class CreateEventTagDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => String(value ?? '').trim())
  name!: string;
}

@Controller('admin/tenants/me/event-tags')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeEventTagsController {
  constructor(private readonly tags: EventTagsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.tags.listForTenant(user.tenantId) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventTagDto) {
    return this.tags.createForTenant(user.tenantId, dto.name);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tags.removeForTenant(user.tenantId, id);
  }
}
