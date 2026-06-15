import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { EventRegistrationsService } from './event-registrations.service';

@Controller('admin/tenants/me')
@UseGuards(AuthGuard('jwt'))
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
