import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TenantsService } from '../tenants/tenants.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import { CreateEventCheckoutDto } from './dto/create-event-checkout.dto';
import { EventRegistrationsService } from './event-registrations.service';
import { EventsService } from './events.service';
import { SchedulesService } from './schedules.service';
import { EventTicketTypesService } from './event-ticket-types.service';
import { EventCheckoutService } from './event-checkout.service';
import { EventOrdersService } from './event-orders.service';
import { renderTicketQrPng } from './ticket-qr';
import { ParticipantSecretGuard } from './participant-secret.guard';

/**
 * Rotas com `x-participant-secret` são chamadas do servidor do site: todos os
 * visitantes chegam com o mesmo IP. Limite mais alto, mas ainda limitado
 * (trava força bruta sobre o segredo).
 */
const PARTICIPANT_ROUTE_THROTTLE = { public: { limit: 300, ttl: 60_000 } };

/** Rate limit: só o throttler `public` (30/min por IP); o checkout também fica sob `links`. */
@Controller('public/tenants')
@SkipThrottle({ links: true, platform: true })
export class PublicEventsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly events: EventsService,
    private readonly registrations: EventRegistrationsService,
    private readonly schedules: SchedulesService,
    private readonly ticketTypes: EventTicketTypesService,
    private readonly checkout: EventCheckoutService,
    private readonly orders: EventOrdersService,
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
    return { items, nextCursor: null };
  }

  /** Home — todos publicados, ordenados por data (sem filtro de futuros). */
  @Get(':slug/events/published')
  async listPublishedEvents(@Param('slug') slug: string) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const items = await this.events.listForTenant(tenant.id, {
      publishedOnly: true,
    });
    return { items, nextCursor: null };
  }

  @Get(':slug/events/:eventId')
  async getEvent(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.events.getPublishedForTenant(tenant.id, eventId);
  }

  @Get(':slug/events/:eventId/tickets')
  async listTicketTypes(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const event = await this.events.getPublishedForTenant(tenant.id, eventId);
    return this.ticketTypes.listPublicForEvent(
      tenant.id,
      eventId,
      event.currency,
    );
  }

  /** Ingresso por id — inclui privados (link directo). */
  @Get(':slug/events/:eventId/tickets/:ticketId')
  async getTicketType(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.ticketTypes.getPublicById(tenant.id, eventId, ticketId);
  }

  @Post(':slug/events/:eventId/checkout')
  @HttpCode(HttpStatus.CREATED)
  @SkipThrottle({ links: false })
  async createCheckout(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateEventCheckoutDto,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.checkout.checkout(tenant, eventId, dto);
  }

  @Get(':slug/events/:eventId/orders/:orderId/payment')
  async getOrderPayment(
    @Param('slug') slug: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.orders.getPaymentStatus(tenant.id, eventId, orderId);
  }

  @Get(':slug/tickets/:ticketId')
  async getTicket(
    @Param('slug') slug: string,
    @Param('ticketId') ticketId: string,
  ) {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    return this.orders.getPublicTicket(tenant.id, ticketId);
  }

  /**
   * QR code do bilhete em PNG — usado pela página pública do bilhete no site.
   * O `publicCode` é o próprio segredo, por isso a rota não é autenticada.
   */
  @Get(':slug/tickets/:ticketId/qr.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'private, max-age=3600')
  async getTicketQr(
    @Param('slug') slug: string,
    @Param('ticketId') ticketId: string,
  ): Promise<StreamableFile> {
    const tenant = await this.tenants.findBySlugOrThrow(slug);
    const ticket = await this.orders.getPublicTicket(tenant.id, ticketId);
    return new StreamableFile(await renderTicketQrPng(ticket.publicCode));
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

  /** Exige `x-participant-secret` (só o servidor do site chama). */
  @Get(':slug/events/:eventId/registrations/check')
  @UseGuards(ParticipantSecretGuard)
  @Throttle(PARTICIPANT_ROUTE_THROTTLE)
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

  /** Devolve dados pessoais: exige `x-participant-secret` (só o servidor do site chama). */
  @Get(':slug/registrations/mine')
  @UseGuards(ParticipantSecretGuard)
  @Throttle(PARTICIPANT_ROUTE_THROTTLE)
  async listMyRegistrations(
    @Param('slug') slug: string,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
  ) {
    if (!email?.trim()) {
      throw new BadRequestException('Informe o e-mail do participante');
    }
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
