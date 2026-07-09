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
      select: { id: true, title: true, date: true, published: true, createdAt: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    const [ticketTypes, ordersByStatus, registrationCount, ticketCount, registrations, orders, revenueByType] =
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
            salesOpensAt: true,
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
        this.prisma.eventRegistration.findMany({
          where: { tenantId, eventId },
          select: { createdAt: true },
        }),
        this.prisma.eventOrder.findMany({
          where: { tenantId, eventId },
          select: { createdAt: true },
        }),
        this.prisma.eventOrderLine.findMany({
          where: {
            order: { tenantId, eventId, status: 'CONFIRMED' },
          },
          select: {
            ticketTypeId: true,
            quantity: true,
            unitPriceCents: true,
          },
        }),
      ]);

    const revenueByTypeMap = new Map<string, number>();
    for (const line of revenueByType) {
      const prev = revenueByTypeMap.get(line.ticketTypeId) ?? 0;
      revenueByTypeMap.set(
        line.ticketTypeId,
        prev + line.quantity * line.unitPriceCents,
      );
    }

    const salesOpensDates = ticketTypes
      .map((row) => row.salesOpensAt)
      .filter((d): d is Date => d != null);
    const salesPeriodStart =
      salesOpensDates.length > 0
        ? new Date(Math.min(...salesOpensDates.map((d) => d.getTime())))
        : event.createdAt;

    const dayCounts = new Map<string, number>();
    const addDay = (date: Date) => {
      if (date < salesPeriodStart) return;
      const key = date.toISOString().slice(0, 10);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    };
    for (const row of registrations) addDay(row.createdAt);
    for (const row of orders) addDay(row.createdAt);

    const registrationsByDay = [...dayCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

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
      salesPeriodStart: salesPeriodStart.toISOString(),
      registrationsByDay,
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
        revenueCents: revenueByTypeMap.get(row.id) ?? 0,
      })),
    };
  }
}
