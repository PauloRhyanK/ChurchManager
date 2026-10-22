import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import {
  DEFAULT_EVENT_TIMEZONE,
  startOfTodayInTimeZone,
  toRegistrationDto,
} from './event-format.util';
import { collectFieldValues } from './event-field-validation.util';
import { isTicketTypeInSalesWindow, isTicketTypeSoldOut } from './event-stock.util';
import { EventTicketTypesService } from './event-ticket-types.service';

@Injectable()
export class EventRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketTypes: EventTicketTypesService,
  ) {}

  async listAllForTenant(tenantId: string) {
    const rows = await this.prisma.eventRegistration.findMany({
      where: { tenantId },
      include: {
        event: { select: { title: true, date: true, tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) =>
      toRegistrationDto(row, row.event),
    );
  }

  async listForEvent(tenantId: string, eventId: string) {
    await this.assertEventBelongsToTenant(tenantId, eventId);
    const rows = await this.prisma.eventRegistration.findMany({
      where: { tenantId, eventId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toRegistrationDto(row));
  }

  async createForEvent(
    tenantId: string,
    eventId: string,
    dto: CreateEventRegistrationDto,
  ) {
    await this.getRegistrableEvent(tenantId, eventId);

    const email = dto.email.trim().toLowerCase();

    // Ingresso opcional: só gratuito, ativo, em janela e com vagas; valida
    // login obrigatório, campos e link de comunidade.
    let ticketTypeId: string | null = null;
    let communityLink: string | null = null;
    let fieldValuesToPersist: Array<{ fieldId: string; value: string }> = [];
    if (dto.ticketTypeId) {
      const ticket = await this.prisma.eventTicketType.findFirst({
        where: { id: dto.ticketTypeId, tenantId, eventId },
        include: { fieldConfigs: { include: { field: true } } },
      });
      if (!ticket || !ticket.active) {
        throw new NotFoundException('Tipo de ingresso não encontrado');
      }
      if (!isTicketTypeInSalesWindow(ticket)) {
        throw new BadRequestException(
          'Este ingresso não está disponível para inscrição',
        );
      }
      if (ticket.priceCents + ticket.feeCents > 0) {
        throw new BadRequestException(
          'Este ingresso é pago. Use o checkout para comprar.',
        );
      }
      if (isTicketTypeSoldOut(ticket)) {
        throw new ConflictException('Ingressos esgotados');
      }
      if (!ticket.allowGuestRegistration && !dto.userId) {
        throw new BadRequestException(
          'É necessário iniciar sessão para se inscrever neste ingresso',
        );
      }
      ticketTypeId = ticket.id;
      communityLink = ticket.communityLink;
      fieldValuesToPersist = collectFieldValues(
        ticket.fieldConfigs.map((fc) => ({
          fieldId: fc.fieldId,
          key: fc.field.key,
          label: fc.field.label,
          enabled: fc.enabled,
          required: fc.required,
        })),
        dto.fieldValues,
      );
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Mesma reserva atômica do checkout: a inscrição e a vaga entram (ou
        // não) juntas, e quem perde a corrida pela última vaga recebe 409.
        if (ticketTypeId) {
          const reserved = await this.ticketTypes.reserveStock(
            tx,
            tenantId,
            ticketTypeId,
            1,
          );
          if (!reserved) {
            throw new ConflictException('Ingressos esgotados');
          }
        }
        return tx.eventRegistration.create({
          data: {
            tenantId,
            eventId,
            name: dto.name.trim(),
            email,
            phone: dto.phone ?? null,
            message: dto.message ?? null,
            userId: dto.userId ?? null,
            ...(fieldValuesToPersist.length > 0
              ? {
                  fieldValues: {
                    create: fieldValuesToPersist.map((fv) => ({
                      fieldId: fv.fieldId,
                      value: fv.value,
                    })),
                  },
                }
              : {}),
          },
        });
      });
      return { ...toRegistrationDto(row), communityLink };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Você já está inscrito neste evento');
      }
      throw err;
    }
  }

  async findExistingRegistration(
    tenantId: string,
    eventId: string,
    email: string,
    userId?: string | null,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.eventRegistration.findFirst({
      where: {
        tenantId,
        eventId,
        OR: [
          { email: normalizedEmail },
          ...(userId ? [{ userId }] : []),
        ],
      },
    });
  }

  async listForParticipant(
    tenantId: string,
    email: string,
    userId?: string | null,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        tenantId,
        OR: [
          { email: normalizedEmail },
          ...(userId ? [{ userId }] : []),
        ],
      },
      include: {
        event: { select: { title: true, date: true, tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toRegistrationDto(row, row.event));
  }

  /**
   * Evento aberto a inscrições: publicado (rascunho responde 404, sem revelar
   * que existe) e com data a partir de hoje no fuso do evento.
   */
  private async getRegistrableEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, published: true, date: true, timezone: true },
    });
    if (!event || !event.published) {
      throw new NotFoundException('Evento não encontrado');
    }
    const today = startOfTodayInTimeZone(event.timezone ?? DEFAULT_EVENT_TIMEZONE);
    if (event.date < today) {
      throw new BadRequestException(
        'As inscrições para este evento foram encerradas',
      );
    }
    return event;
  }

  private async assertEventBelongsToTenant(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
  }
}
