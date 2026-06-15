import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { EventReportsService } from './event-reports.service';

/** Endpoints de agregação admin — separados do CRUD para manter responsabilidades claras. */
@Controller('admin/tenants/me/events-dashboard')
@UseGuards(AuthGuard('jwt'))
export class TenantsMeEventsDashboardController {
  constructor(private readonly reports: EventReportsService) {}

  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    return this.reports.getTenantDashboardSummary(user.tenantId);
  }

  @Get(':eventId/report')
  async eventReport(
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.reports.getEventReport(user.tenantId, eventId);
  }
}
