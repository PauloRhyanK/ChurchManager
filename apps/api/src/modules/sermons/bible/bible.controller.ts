import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../../access/permissions.guard';
import { RequirePermission } from '../../access/require-permission.decorator';
import { BibleService } from './bible.service';
import { BibleSearchQuery } from './dto/bible.dto';

/** Palavras: consulta à Bíblia (tabelas globais, sem tenant). */
@Controller('admin/tenants/me/sermons/bible')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.SERMONS, PermissionLevel.VIEW)
export class BibleController {
  constructor(private readonly bible: BibleService) {}

  @Get('translations')
  translations() {
    return this.bible.translations();
  }

  /** A busca roda a cada pausa na digitação: 30/min seria pouco. */
  @Get('search')
  @Throttle({ public: { limit: 120, ttl: 60_000 } })
  search(@Query() query: BibleSearchQuery) {
    return this.bible.search(query.q, query.translation);
  }
}
