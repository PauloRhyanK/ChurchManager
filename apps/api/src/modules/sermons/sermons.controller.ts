import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SermonStatus } from './delivery-match';
import { CreateSermonDto, UpdateSermonDto } from './dto/sermon.dto';
import { SermonsService } from './sermons.service';

const STATUSES: SermonStatus[] = ['DRAFT', 'SENT', 'PREACHED'];

/** Palavras: a biblioteca privada do pregador. Só o autor enxerga, nem administrador. */
@Controller('admin/tenants/me/sermons')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.SERMONS, PermissionLevel.VIEW)
export class SermonsController {
  constructor(private readonly sermons: SermonsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.sermons.list(user, {
      q: typeof q === 'string' ? q.slice(0, 200) : undefined,
      status: STATUSES.find((s) => s === status),
    });
  }

  @Post()
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSermonDto) {
    return this.sermons.create(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sermons.get(user, id);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSermonDto) {
    return this.sermons.update(user, id, dto);
  }

  @Post(':id/duplicate')
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sermons.duplicate(user, id);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sermons.remove(user, id);
  }
}
