import { Module, forwardRef } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialModule } from '../financial/financial.module';
import { EventsService } from './events.service';
import { EventRegistrationsService } from './event-registrations.service';
import { SchedulesService } from './schedules.service';
import { EventTicketTypesService } from './event-ticket-types.service';
import { EventCheckoutService } from './event-checkout.service';
import { EventOrdersService } from './event-orders.service';
import { EventReportsService } from './event-reports.service';
import { TenantsMeEventsController } from './tenants-me-events.controller';
import { TenantsMeRegistrationsController } from './tenants-me-registrations.controller';
import { TenantsMeSchedulesController } from './tenants-me-schedules.controller';
import { TenantsMeEventTicketTypesController } from './tenants-me-event-ticket-types.controller';
import { TenantsMeEventsDashboardController } from './tenants-me-events-dashboard.controller';
import { PublicEventsController } from './public-events.controller';

@Module({
  imports: [TenantsModule, AuthModule, forwardRef(() => FinancialModule)],
  controllers: [
    TenantsMeEventsController,
    TenantsMeRegistrationsController,
    TenantsMeSchedulesController,
    TenantsMeEventTicketTypesController,
    TenantsMeEventsDashboardController,
    PublicEventsController,
  ],
  providers: [
    EventsService,
    EventRegistrationsService,
    SchedulesService,
    EventTicketTypesService,
    EventCheckoutService,
    EventOrdersService,
    EventReportsService,
  ],
  exports: [
    EventsService,
    EventRegistrationsService,
    SchedulesService,
    EventTicketTypesService,
    EventOrdersService,
  ],
})
export class EventsModule {}
