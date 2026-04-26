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
import { CreateLinkPresetDto } from './dto/create-link-preset.dto';
import { UpdateLinkPresetDto } from './dto/update-link-preset.dto';
import { PaymentLinkPresetsService } from './payment-link-presets.service';

@Controller('admin/tenants/me/link-presets')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeLinkPresetsController {
  constructor(private readonly presets: PaymentLinkPresetsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.presets.listForTenant(user.tenantId) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateLinkPresetDto) {
    return this.presets.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLinkPresetDto,
  ) {
    return this.presets.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.presets.removeForTenant(user.tenantId, id);
  }
}
