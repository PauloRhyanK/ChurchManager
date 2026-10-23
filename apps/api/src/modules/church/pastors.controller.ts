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
import { CreatePastorDto } from './dto/create-pastor.dto';
import { UpdatePastorDto } from './dto/update-pastor.dto';
import { PastorsService } from './pastors.service';

@Controller('admin/tenants/me/pastors')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.CHURCH, PermissionLevel.VIEW)
export class PastorsController {
  constructor(private readonly pastors: PastorsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.pastors.listForTenant(user.tenantId) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pastors.getForTenant(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePastorDto) {
    return this.pastors.createForTenant(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePastorDto,
  ) {
    return this.pastors.updateForTenant(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.CHURCH, PermissionLevel.EDIT)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pastors.removeForTenant(user.tenantId, id);
  }
}
