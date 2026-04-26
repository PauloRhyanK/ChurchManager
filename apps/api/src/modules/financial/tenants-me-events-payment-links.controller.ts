import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { TenantsService } from '../tenants/tenants.service';
import { CreateEventTicketLinkDto } from './dto/create-event-ticket-link.dto';
import { PaymentLinksOrchestratorService } from './payment-links-orchestrator.service';

@Controller('admin/tenants/me/events')
@UseGuards(AuthGuard('jwt'))
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
