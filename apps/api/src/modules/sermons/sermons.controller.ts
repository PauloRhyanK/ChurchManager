import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SermonStatus } from './delivery-match';
import { DeliveryPreviewQuery, SendSermonDto } from './dto/delivery.dto';
import { CreateSermonDto, UpdateSermonDto } from './dto/sermon.dto';
import { GenerateSlidesDto, SaveSlidesDto } from './dto/slides.dto';
import { SermonDeliveryService } from './sermon-delivery.service';
import { SermonSlidesService } from './sermon-slides.service';
import { SermonsService } from './sermons.service';

const STATUSES: SermonStatus[] = ['DRAFT', 'SENT', 'PREACHED'];

/** Palavras: a biblioteca privada do pregador. Só o autor enxerga, nem administrador. */
@Controller('admin/tenants/me/sermons')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.SERMONS, PermissionLevel.VIEW)
export class SermonsController {
  constructor(
    private readonly sermons: SermonsService,
    private readonly deliveries: SermonDeliveryService,
    private readonly slides: SermonSlidesService,
  ) {}

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

  @Get('service-options')
  serviceOptions(@CurrentUser() user: AuthUser) {
    return this.deliveries.serviceOptions(user);
  }

  @Get('delivery-preview')
  deliveryPreview(@CurrentUser() user: AuthUser, @Query() query: DeliveryPreviewQuery) {
    return this.deliveries.preview(user.tenantId, query.date, query.startTime);
  }

  /** Se os slides completos estão ligados e quais modelos há; nunca a chave. Antes de ':id'. */
  @Get('ai')
  aiOptions() {
    return this.slides.aiOptions();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sermons.get(user, id);
  }

  /** O autosave salva a cada pausa na digitação: 30/min por rota e IP seria pouco. */
  @Put(':id')
  @Throttle({ public: { limit: 120, ttl: 60_000 } })
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

  @Put(':id/delivery')
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendSermonDto) {
    return this.deliveries.send(user, id, dto);
  }

  @Delete(':id/delivery')
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.cancel(user, id);
  }

  /** Slides completos chamam um provedor externo: limite próprio, mais apertado, para não empilhar chamadas. */
  @Post(':id/slides/generate')
  @Throttle({ public: { limit: 20, ttl: 60_000 } })
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  generateSlides(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateSlidesDto) {
    return this.slides.generate(user, id, dto);
  }

  /** Marcar, reordenar e editar salva a cada mudança: o mesmo limite do autosave. */
  @Put(':id/slides')
  @Throttle({ public: { limit: 120, ttl: 60_000 } })
  @RequirePermission(PermissionModule.SERMONS, PermissionLevel.EDIT)
  saveSlides(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveSlidesDto) {
    return this.slides.save(user, id, dto);
  }
}
