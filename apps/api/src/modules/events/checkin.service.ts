import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventTicketTypesService } from './event-ticket-types.service';
import { generatePublicCode } from './event-orders.service';
import { formatDateOnly, formatTimeOnly, startOfTodayUtc } from './event-format.util';
import { IssueFreeTicketsDto } from './dto/checkin-issue-free-tickets.dto';

interface AuthActor {
  userId: string;
  email: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Filtro que resolve um ingresso por `publicCode` (QR) ou `id`. O `id` só entra
 * na consulta quando o valor é um UUID válido — caso contrário o Postgres lança
 * erro ao converter o código do QR para a coluna `id @db.Uuid`.
 */
function ticketMatch(tenantId: string, codeOrId: string) {
  const value = codeOrId.trim();
  return {
    tenantId,
    OR: UUID_RE.test(value)
      ? [{ publicCode: value }, { id: value }]
      : [{ publicCode: value }],
  };
}

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketTypes: EventTicketTypesService,
  ) {}

  /** Eventos para check-in: por padrão os de hoje, com contadores de presença. */
  async listEvents(tenantId: string, scope: 'today' | 'all' = 'today') {
    let dateFilter = {};
    if (scope === 'today') {
      const start = startOfTodayUtc();
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      dateFilter = { date: { gte: start, lt: end } };
    }
    const events = await this.prisma.event.findMany({
      where: { tenantId, ...dateFilter },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        title: true,
        date: true,
        timeStart: true,
        location: true,
        tag: true,
      },
    });
    const eventIds = events.map((e) => e.id);

    // Contadores de ingressos válidos (emitidos) e com entrada por evento.
    const tickets = eventIds.length
      ? await this.prisma.eventTicket.findMany({
          where: { tenantId, status: 'VALID', order: { eventId: { in: eventIds } } },
          select: { checkedInAt: true, order: { select: { eventId: true } } },
        })
      : [];
    const counts = new Map<string, { issued: number; checkedIn: number }>();
    for (const t of tickets) {
      const key = t.order.eventId;
      const c = counts.get(key) ?? { issued: 0, checkedIn: 0 };
      c.issued += 1;
      if (t.checkedInAt) c.checkedIn += 1;
      counts.set(key, c);
    }

    return events.map((e) => {
      const c = counts.get(e.id) ?? { issued: 0, checkedIn: 0 };
      return {
        id: e.id,
        title: e.title,
        date: formatDateOnly(e.date),
        timeStart: formatTimeOnly(e.timeStart),
        location: e.location,
        tag: e.tag,
        ticketsIssued: c.issued,
        checkedIn: c.checkedIn,
      };
    });
  }

  /** Tipos de ingresso de um evento (mínimo) para a inscrição no local. */
  async listEventTicketTypes(tenantId: string, eventId: string) {
    await this.assertEvent(tenantId, eventId);
    const types = await this.prisma.eventTicketType.findMany({
      where: { tenantId, eventId, active: true },
      orderBy: { priceCents: 'asc' },
      select: { id: true, name: true, priceCents: true, feeCents: true },
    });
    return {
      items: types.map((t) => ({
        id: t.id,
        name: t.name,
        priceCents: t.priceCents,
        feeCents: t.feeCents,
        isFree: t.priceCents + t.feeCents === 0,
      })),
    };
  }

  /** Ingressos de um evento agrupados por pedido (lote), com filtro opcional. */
  async listEventTickets(tenantId: string, eventId: string, search?: string) {
    await this.assertEvent(tenantId, eventId);
    const term = search?.trim();
    const rows = await this.prisma.eventTicket.findMany({
      where: {
        tenantId,
        order: { eventId },
        ...(term
          ? {
              OR: [
                { holderName: { contains: term, mode: 'insensitive' } },
                { publicCode: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        ticketType: { select: { name: true } },
        order: { select: { id: true, payer: { select: { name: true } } } },
      },
      orderBy: [{ orderId: 'asc' }, { createdAt: 'asc' }],
    });

    const lotes = new Map<
      string,
      { orderId: string; buyerName: string | null; tickets: ReturnType<typeof this.toTicketDto>[] }
    >();
    for (const row of rows) {
      const lote = lotes.get(row.orderId) ?? {
        orderId: row.orderId,
        buyerName: row.order.payer?.name ?? null,
        tickets: [],
      };
      lote.tickets.push(this.toTicketDto(row));
      lotes.set(row.orderId, lote);
    }
    return { items: Array.from(lotes.values()) };
  }

  /** Resolve um código escaneado e devolve o ingresso + irmãos do mesmo lote. */
  async lookupByCode(tenantId: string, code: string) {
    const normalized = code?.trim();
    if (!normalized) {
      throw new BadRequestException('Código não informado');
    }
    const ticket = await this.prisma.eventTicket.findFirst({
      where: ticketMatch(tenantId, normalized),
      include: {
        ticketType: { select: { name: true } },
        order: {
          select: {
            id: true,
            eventId: true,
            payer: { select: { name: true } },
            event: { select: { title: true, date: true, timeStart: true } },
          },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ingresso não encontrado');
    }
    const siblings = await this.prisma.eventTicket.findMany({
      where: { tenantId, orderId: ticket.orderId },
      include: { ticketType: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ticket: this.toTicketDto(ticket),
      event: {
        id: ticket.order.eventId,
        title: ticket.order.event.title,
        date: formatDateOnly(ticket.order.event.date),
        timeStart: formatTimeOnly(ticket.order.event.timeStart),
      },
      lote: {
        orderId: ticket.orderId,
        buyerName: ticket.order.payer?.name ?? null,
        tickets: siblings.map((s) => this.toTicketDto(s)),
      },
    };
  }

  /** Marca presença de forma idempotente. */
  async checkIn(tenantId: string, ticketId: string, actor: AuthActor) {
    const ticket = await this.prisma.eventTicket.findFirst({
      where: ticketMatch(tenantId, ticketId),
    });
    if (!ticket) {
      throw new NotFoundException('Ingresso não encontrado');
    }
    if (ticket.status !== 'VALID') {
      throw new BadRequestException('Ingresso não está válido para entrada');
    }
    if (ticket.checkedInAt) {
      throw new ConflictException({
        message: 'Este ingresso já deu entrada',
        checkedInAt: ticket.checkedInAt,
        checkedInByName: ticket.checkedInByName,
      });
    }
    const updated = await this.prisma.eventTicket.update({
      where: { id: ticket.id },
      data: {
        checkedInAt: new Date(),
        checkedInByUserId: actor.userId,
        checkedInByName: actor.email,
      },
      include: { ticketType: { select: { name: true } } },
    });
    return this.toTicketDto(updated);
  }

  /** Desfaz a entrada (correção de engano). */
  async undoCheckIn(tenantId: string, ticketId: string) {
    const ticket = await this.prisma.eventTicket.findFirst({
      where: ticketMatch(tenantId, ticketId),
    });
    if (!ticket) {
      throw new NotFoundException('Ingresso não encontrado');
    }
    const updated = await this.prisma.eventTicket.update({
      where: { id: ticket.id },
      data: {
        checkedInAt: null,
        checkedInByUserId: null,
        checkedInByName: null,
      },
      include: { ticketType: { select: { name: true } } },
    });
    return this.toTicketDto(updated);
  }

  /** Emissão gratuita no local: cria pedido confirmado + ingressos, sem pagamento. */
  async issueFreeTickets(
    tenantId: string,
    eventId: string,
    dto: IssueFreeTicketsDto,
  ) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, currency: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
    const type = await this.prisma.eventTicketType.findFirst({
      where: { id: dto.ticketTypeId, tenantId, eventId, active: true },
      select: { id: true, priceCents: true, feeCents: true },
    });
    if (!type) {
      throw new NotFoundException('Tipo de ingresso não encontrado');
    }
    if (type.priceCents + type.feeCents !== 0) {
      throw new BadRequestException(
        'Emissão no local disponível apenas para ingressos gratuitos',
      );
    }
    const names = dto.holderNames
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) {
      throw new BadRequestException('Informe ao menos um nome');
    }

    const orderId = await this.prisma.$transaction(async (tx) => {
      const ok = await this.ticketTypes.reserveStock(
        tx,
        tenantId,
        type.id,
        names.length,
      );
      if (!ok) {
        throw new ConflictException(
          'Estoque insuficiente para o número de ingressos',
        );
      }
      const order = await tx.eventOrder.create({
        data: {
          tenantId,
          eventId,
          status: 'CONFIRMED',
          totalCents: 0,
          currency: event.currency,
          confirmedAt: new Date(),
          lines: {
            create: {
              ticketTypeId: type.id,
              quantity: names.length,
              unitPriceCents: 0,
              holderNames: names,
            },
          },
        },
        select: { id: true },
      });
      await tx.eventTicket.createMany({
        data: names.map((name) => ({
          tenantId,
          orderId: order.id,
          ticketTypeId: type.id,
          publicCode: generatePublicCode(),
          holderName: name,
        })),
      });
      return order.id;
    });

    const tickets = await this.prisma.eventTicket.findMany({
      where: { tenantId, orderId },
      include: { ticketType: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { orderId, tickets: tickets.map((t) => this.toTicketDto(t)) };
  }

  private toTicketDto(row: {
    id: string;
    publicCode: string;
    holderName: string;
    status: string;
    checkedInAt: Date | null;
    checkedInByName: string | null;
    orderId: string;
    ticketType: { name: string };
  }) {
    return {
      id: row.id,
      publicCode: row.publicCode,
      holderName: row.holderName,
      status: row.status,
      checkedInAt: row.checkedInAt,
      checkedInByName: row.checkedInByName,
      orderId: row.orderId,
      ticketTypeName: row.ticketType.name,
    };
  }

  private async assertEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
  }
}
