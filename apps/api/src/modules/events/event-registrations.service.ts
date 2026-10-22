import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventTicketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventRegistrationDto } from './dto/create-event-registration.dto';
import {
  safeTimeZone,
  startOfTodayInTimeZone,
  toRegistrationDto,
} from './event-format.util';
import { collectFieldValues } from './event-field-validation.util';
import { isTicketTypeInSalesWindow, isTicketTypeSoldOut } from './event-stock.util';
import { EventTicketTypesService } from './event-ticket-types.service';

export type CreateRegistrationOptions = {
  /**
   * `true` (padrão, site público): evento publicado e não passado; ingresso em
   * janela de venda, gratuito e com vaga, reservada na mesma transação.
   * `false` (painel): só exige evento e ingresso ativo do tenant; o e-mail
   * duplicado continua respondendo 409.
   */
  enforcePublicRules?: boolean;
};

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
    { enforcePublicRules = true }: CreateRegistrationOptions = {},
  ) {
    if (enforcePublicRules) {
      await this.getRegistrableEvent(tenantId, eventId);
    } else {
      await this.assertEventBelongsToTenant(tenantId, eventId);
    }

    const email = dto.email.trim().toLowerCase();

    // Ingresso opcional: tem de existir e estar ativo; no site, também gratuito,
    // em janela e com vagas. Valida login obrigatório, campos e link de comunidade.
    let reserveTicketTypeId: string | null = null;
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
      if (enforcePublicRules) {
        this.assertTicketOpenForPublicRegistration(ticket);
        reserveTicketTypeId = ticket.id;
      }
      if (!ticket.allowGuestRegistration && !dto.userId) {
        throw new BadRequestException(
          'É necessário iniciar sessão para se inscrever neste ingresso',
        );
      }
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
        if (reserveTicketTypeId) {
          const reserved = await this.ticketTypes.reserveStock(
            tx,
            tenantId,
            reserveTicketTypeId,
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
    const today = startOfTodayInTimeZone(safeTimeZone(event.timezone));
    if (event.date < today) {
      throw new BadRequestException(
        'As inscrições para este evento foram encerradas',
      );
    }
    return event;
  }

  /** Regras do site para inscrição com ingresso: em janela, gratuito e com vaga. */
  private assertTicketOpenForPublicRegistration(
    ticket: Pick<
      EventTicketType,
      | 'salesOpensAt'
      | 'salesClosesAt'
      | 'priceCents'
      | 'feeCents'
      | 'quantityTotal'
      | 'quantitySold'
    >,
  ) {
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
