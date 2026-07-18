import { Module, forwardRef } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { AccessModule } from '../access/access.module';
import { FinancialModule } from '../financial/financial.module';
import { EventsService } from './events.service';
import { EventRegistrationsService } from './event-registrations.service';
import { SchedulesService } from './schedules.service';
import { EventTicketTypesService } from './event-ticket-types.service';
import { EventCheckoutService } from './event-checkout.service';
import { EventOrdersService } from './event-orders.service';
import { EventReportsService } from './event-reports.service';
import { EventTagsService } from './event-tags.service';
import { EventFieldDefinitionsService } from './event-field-definitions.service';
import { CheckinService } from './checkin.service';
import { TicketDeliveryService } from './ticket-delivery.service';
import { TenantsMeEventsController } from './tenants-me-events.controller';
import { TenantsMeRegistrationsController } from './tenants-me-registrations.controller';
import { TenantsMeSchedulesController } from './tenants-me-schedules.controller';
import { TenantsMeEventTicketTypesController } from './tenants-me-event-ticket-types.controller';
import { TenantsMeEventsDashboardController } from './tenants-me-events-dashboard.controller';
import { TenantsMeEventTagsController } from './tenants-me-event-tags.controller';
import { TenantsMeEventFieldsController } from './tenants-me-event-fields.controller';
import { TenantsMeCheckinController } from './tenants-me-checkin.controller';
import { PublicEventsController } from './public-events.controller';

@Module({
  imports: [
    TenantsModule,
    AuthModule,
    AccessModule,
    forwardRef(() => FinancialModule),
  ],
  controllers: [
    TenantsMeEventsController,
    TenantsMeRegistrationsController,
    TenantsMeSchedulesController,
    TenantsMeEventTicketTypesController,
    TenantsMeEventsDashboardController,
    TenantsMeEventTagsController,
    TenantsMeEventFieldsController,
    TenantsMeCheckinController,
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
    EventTagsService,
    EventFieldDefinitionsService,
    CheckinService,
    TicketDeliveryService,
  ],
  exports: [
    EventsService,
    EventRegistrationsService,
    SchedulesService,
    EventTicketTypesService,
    EventOrdersService,
    EventTagsService,
    EventFieldDefinitionsService,
  ],
})
export class EventsModule {}
