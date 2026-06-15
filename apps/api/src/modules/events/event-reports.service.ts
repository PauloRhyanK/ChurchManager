import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDateOnly, startOfTodayUtc } from './event-format.util';

@Injectable()
export class EventReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resumo agregado para o dashboard admin (M3). */
  async getTenantDashboardSummary(tenantId: string) {
    const today = startOfTodayUtc();

    const [
      totalEvents,
      publishedEvents,
      upcomingEvents,
      totalRegistrations,
      confirmedOrders,
      revenueAgg,
      upcomingList,
    ] = await Promise.all([
      this.prisma.event.count({ where: { tenantId } }),
      this.prisma.event.count({ where: { tenantId, published: true } }),
      this.prisma.event.count({ where: { tenantId, date: { gte: today } } }),
      this.prisma.eventRegistration.count({ where: { tenantId } }),
      this.prisma.eventOrder.count({
        where: { tenantId, status: 'CONFIRMED' },
      }),
      this.prisma.eventOrder.aggregate({
        where: { tenantId, status: 'CONFIRMED' },
        _sum: { totalCents: true },
      }),
      this.prisma.event.findMany({
        where: { tenantId, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 5,
        select: { id: true, title: true, date: true, published: true },
      }),
    ]);

    return {
      totalEvents,
      publishedEvents,
      upcomingEvents,
      totalRegistrations,
      confirmedOrders,
      totalRevenueCents: revenueAgg._sum.totalCents ?? 0,
      upcomingEventsList: upcomingList.map((row) => ({
        id: row.id,
        title: row.title,
        date: formatDateOnly(row.date),
        published: row.published,
      })),
    };
  }

  /** Relatório de vendas por evento (M3). */
  async getEventReport(tenantId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, title: true, date: true, published: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    const [ticketTypes, ordersByStatus, registrationCount, ticketCount] =
      await Promise.all([
        this.prisma.eventTicketType.findMany({
          where: { tenantId, eventId },
          orderBy: { priceCents: 'asc' },
          select: {
            id: true,
            name: true,
            priceCents: true,
            quantityTotal: true,
            quantitySold: true,
            active: true,
          },
        }),
        this.prisma.eventOrder.groupBy({
          by: ['status'],
          where: { tenantId, eventId },
          _count: { _all: true },
          _sum: { totalCents: true },
        }),
        this.prisma.eventRegistration.count({
          where: { tenantId, eventId },
        }),
        this.prisma.eventTicket.count({
          where: { tenantId, order: { eventId } },
        }),
      ]);

    const ordersSummary = ordersByStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
      totalCents: row._sum.totalCents ?? 0,
    }));

    const confirmedRevenueCents = ordersSummary
      .filter((row) => row.status === 'CONFIRMED')
      .reduce((acc, row) => acc + row.totalCents, 0);

    const ticketsSold = ticketTypes.reduce(
      (acc, row) => acc + row.quantitySold,
      0,
    );

    return {
      event: {
        id: event.id,
        title: event.title,
        date: formatDateOnly(event.date),
        published: event.published,
      },
      registrationCount,
      ticketsIssued: ticketCount,
      ticketsSold,
      confirmedRevenueCents,
      ordersSummary,
      ticketTypes: ticketTypes.map((row) => ({
        id: row.id,
        name: row.name,
        priceCents: row.priceCents,
        quantityTotal: row.quantityTotal,
        quantitySold: row.quantitySold,
        quantityRemaining:
          row.quantityTotal != null
            ? Math.max(0, row.quantityTotal - row.quantitySold)
            : null,
        active: row.active,
      })),
    };
  }
}
