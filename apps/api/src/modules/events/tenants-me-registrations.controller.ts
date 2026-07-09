import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { EventRegistrationsService } from './event-registrations.service';

@Controller('admin/tenants/me')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.EVENT_REGISTRATIONS, PermissionLevel.VIEW)
export class TenantsMeRegistrationsController {
  constructor(private readonly registrations: EventRegistrationsService) {}

  /** Equivalente a /admin/inscricoes — todas as inscrições com join do evento. */
  @Get('registrations')
  async listAll(@CurrentUser() user: AuthUser) {
    return { items: await this.registrations.listAllForTenant(user.tenantId) };
  }

  @Get('events/:eventId/registrations')
  async listForEvent(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return {
      items: await this.registrations.listForEvent(user.tenantId, eventId),
    };
  }
}
