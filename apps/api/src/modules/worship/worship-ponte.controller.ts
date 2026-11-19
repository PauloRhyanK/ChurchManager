import { Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { PONTE_KEY_HEADER, WorshipPonteService } from './worship-ponte.service';

/** A chave com que a Ponte do Culto lê o roteiro. Gerar e revogar é de quem cuida das configurações. */
@Controller('admin/tenants/me/worship/ponte-key')
@SkipThrottle({ links: true, platform: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.WORSHIP, PermissionLevel.VIEW)
export class WorshipPonteKeyController {
  constructor(private readonly ponte: WorshipPonteService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.ponte.keyStatus(user.tenantId);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission(PermissionModule.SETTINGS, PermissionLevel.EDIT)
  generate(@CurrentUser() user: AuthUser) {
    return this.ponte.generateKey(user.tenantId);
  }

  @Delete()
  @RequirePermission(PermissionModule.SETTINGS, PermissionLevel.EDIT)
  revoke(@CurrentUser() user: AuthUser) {
    return this.ponte.revokeKey(user.tenantId);
  }
}

/**
 * O que a Ponte do Culto lê: o culto, os momentos e as músicas prontas para
 * executar. Exige a chave da igreja no header `x-ponte-key`. Rate limit: só o
 * throttler `public` (30/min por IP), suficiente para uma consulta a cada 5 s.
 */
@Controller('public/tenants')
@SkipThrottle({ links: true, platform: true })
export class PublicWorshipPonteController {
  constructor(private readonly ponte: WorshipPonteService) {}

  @Get(':slug/worship/services/next')
  async next(@Param('slug') slug: string, @Headers(PONTE_KEY_HEADER) key: string | undefined) {
    return this.ponte.nextService(await this.ponte.authorize(slug, key));
  }

  @Get(':slug/worship/services/:id')
  async byId(
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(PONTE_KEY_HEADER) key: string | undefined,
  ) {
    return this.ponte.serviceById(await this.ponte.authorize(slug, key), id);
  }
}
