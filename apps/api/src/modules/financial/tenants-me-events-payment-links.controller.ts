import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PermissionLevel, PermissionModule } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { RequirePermission } from '../access/require-permission.decorator';
import { TenantsService } from '../tenants/tenants.service';
import { CreateEventTicketLinkDto } from './dto/create-event-ticket-link.dto';
import { PaymentLinksOrchestratorService } from './payment-links-orchestrator.service';

@Controller('admin/tenants/me/events')
@SkipThrottle({ links: true })
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequirePermission(PermissionModule.FINANCIAL, PermissionLevel.EDIT)
export class TenantsMeEventsPaymentLinksController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly orchestrator: PaymentLinksOrchestratorService,
  ) {}

  @Post(':eventId/ticket-types/:ticketTypeId/payment-link')
  async createOrReuseLink(
    @CurrentUser() user: AuthUser,
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Body() dto: CreateEventTicketLinkDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(user.tenantSlug);
    return this.orchestrator.createOrReuseEventAutoLink(tenant, {
      eventId,
      ticketTypeId,
      presetKey: dto.presetKey,
      fallbackName: dto.name,
    });
  }
}
