import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { EventRegistrationsService } from './event-registrations.service';
import { EventsService } from './events.service';
import { SchedulesService } from './schedules.service';

@Controller('public/tenants')
export class PublicEventsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly events: EventsService,
    private readonly registrations: EventRegistrationsService,
    private readonly schedules: SchedulesService,
  ) {}

  /**
   * Lista eventos publicados.
   * ?upcomingOnly=true — equivalente a /eventos no site (date >= hoje).
   */
  @Get(':slug/events')
  async listEvents(
    @Param('slug') slug: string,
    @Query('upcomingOnly') upcomingOnly?: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const items = await this.events.listForTenant(tenant.id, {
      publishedOnly: true,
      upcomingOnly: upcomingOnly === 'true' || upcomingOnly === '1',
    });
    return { items };
  }

  /** Home — todos publicados, ordenados por data (sem filtro de futuros). */
  @Get(':slug/events/published')
  async listPublishedEvents(@Param('slug') slug: string) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const items = await this.events.listForTenant(tenant.id, {
      publishedOnly: true,
    });
    return { items };
  }

  @Get(':slug/events/:eventId')
  async getEvent(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.events.getPublicByTenant(tenant.id, eventId);
  }

  @Post(':slug/events/:eventId/registrations')
  async createRegistration(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventRegistrationDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.registrations.createForEvent(tenant.id, eventId, dto);
  }

  @Get(':slug/events/:eventId/registrations/check')
  async checkRegistration(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    if (!email && !userId) {
      return { registered: false };
    }
    const existing = await this.registrations.findExistingRegistration(
      tenant.id,
      eventId,
      email ?? '',
      userId,
    );
    return { registered: existing != null };
  }

  @Get(':slug/registrations/mine')
  async listMyRegistrations(
    @Param('slug') slug: string,
    @Query('email') email: string,
    @Query('userId') userId?: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const items = await this.registrations.listForParticipant(
      tenant.id,
      email,
      userId,
    );
    return { items };
  }

  @Get(':slug/schedules')
  async listSchedules(@Param('slug') slug: string) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const items = await this.schedules.listForTenant(tenant.id, true);
    return { items };
  }
}
