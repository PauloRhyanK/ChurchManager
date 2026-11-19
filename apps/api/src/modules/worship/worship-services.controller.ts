import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateServiceDto, CreateTemplateDto, SetMomentsDto, SetSongsDto, UpdateServiceDto, UpdateTemplateDto } from './dto/service.dto';
import { WorshipServicesService } from './worship-services.service';

/** Cultos › Roteiro: o culto inteiro e as músicas do louvor. */
@Controller('admin/tenants/me/worship/services')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.WORSHIP, PermissionLevel.VIEW)
export class WorshipServicesController {
  constructor(private readonly services: WorshipServicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.services.list(user.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.get(user.tenantId, id);
  }

  /** Prévia dos slides da palavra do culto (só a parte pública, copiada no envio). */
  @Get(':id/sermon')
  sermon(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.sermonSlides(user.tenantId, id, user.userId);
  }

  @Post()
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
    return this.services.create(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.remove(user.tenantId, id);
  }

  @Put(':id/moments')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  setMoments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetMomentsDto) {
    return this.services.setMoments(user.tenantId, id, dto);
  }

  @Put(':id/songs')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  setSongs(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSongsDto) {
    return this.services.setSongs(user.tenantId, id, dto);
  }
}

/** Modelos de culto: o Culto padrão embutido e os que a igreja salvou. */
@Controller('admin/tenants/me/worship/service-templates')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.WORSHIP, PermissionLevel.VIEW)
export class WorshipTemplatesController {
  constructor(private readonly services: WorshipServicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.services.listTemplates(user.tenantId);
  }

  @Post()
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.services.createTemplate(user.tenantId, dto);
  }

  @Put(':id')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.services.updateTemplate(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.WORSHIP, PermissionLevel.EDIT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.removeTemplate(user.tenantId, id);
  }
}
