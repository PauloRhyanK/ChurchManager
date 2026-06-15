import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { EventsService } from './events.service';
import { EventRegistrationsService } from './event-registrations.service';
import { SchedulesService } from './schedules.service';
import { TenantsMeEventsController } from './tenants-me-events.controller';
import { TenantsMeRegistrationsController } from './tenants-me-registrations.controller';
import { TenantsMeSchedulesController } from './tenants-me-schedules.controller';
import { PublicEventsController } from './public-events.controller';

@Module({
  imports: [TenantsModule, AuthModule],
  controllers: [
    TenantsMeEventsController,
    TenantsMeRegistrationsController,
    TenantsMeSchedulesController,
    PublicEventsController,
  ],
  providers: [EventsService, EventRegistrationsService, SchedulesService],
  exports: [EventsService, EventRegistrationsService, SchedulesService],
})
export class EventsModule {}
