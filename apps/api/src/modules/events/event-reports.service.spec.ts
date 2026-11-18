import assert from 'node:assert/strict';
import test from 'node:test';
import { EventReportsService } from './event-reports.service';
import type { PrismaService } from '../../prisma/prisma.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('getTenantDashboardSummary conta próximos eventos a partir de "hoje" no fuso America/Sao_Paulo', async (t) => {
  // 21:30 em Brasília do dia 22 = 00:30 UTC do dia 23.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T00:30:00Z') });
  const countWheres: any[] = [];
  let findManyWhere: any;
  const prisma = {
    event: {
      count: async (args: any) => {
        countWheres.push(args.where);
        return 0;
      },
      findMany: async (args: any) => {
        findManyWhere = args.where;
        return [];
      },
    },
    eventRegistration: { count: async () => 0 },
    eventOrder: {
      count: async () => 0,
      aggregate: async () => ({ _sum: { totalCents: null } }),
    },
  };
  const svc = new EventReportsService(prisma as unknown as PrismaService);

  const summary = await svc.getTenantDashboardSummary(TENANT);

  const upcomingWhere = countWheres.find((where) => where.date);
  assert.equal(upcomingWhere.date.gte.toISOString(), '2026-10-22T00:00:00.000Z');
  assert.equal(findManyWhere.date.gte.toISOString(), '2026-10-22T00:00:00.000Z');
  assert.equal(summary.totalRevenueCents, 0);
});

test('getEventParticipants devolve um item por bilhete com comprador e campos sem termos', async () => {
  let ticketWhere: any;
  const prisma = {
    event: {
      findFirst: async () => ({ id: 'e1', title: 'Conferência', date: new Date('2026-11-20T00:00:00Z') }),
    },
    eventTicket: {
      findMany: async (args: any) => {
        ticketWhere = args.where;
        return [
          {
            id: 't1',
            holderName: 'Ana',
            publicCode: 'ABC123',
            status: 'VALID',
            checkedInAt: null,
            createdAt: new Date('2026-11-01T10:00:00Z'),
            ticketType: { name: 'Geral' },
            order: {
              id: 'o1',
              status: 'CONFIRMED',
              payer: { name: 'Bruno', email: 'b@x.com', phone: '11999990000' },
              fieldValues: [
                { value: 'Sede', field: { label: 'Igreja', type: 'TEXT' } },
                { value: 'true', field: { label: 'Aceito', type: 'TERMS' } },
              ],
            },
          },
        ];
      },
    },
  };
  const svc = new EventReportsService(prisma as unknown as PrismaService);

  const result = await svc.getEventParticipants(TENANT, 'e1');

  assert.deepEqual(ticketWhere, { tenantId: TENANT, order: { eventId: 'e1' } });
  assert.equal(result.event.date, '2026-11-20');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].buyerName, 'Bruno');
  assert.deepEqual(result.items[0].fields, [{ label: 'Igreja', value: 'Sede' }]);
});

test('getEventParticipants recusa evento de outro tenant', async () => {
  const prisma = { event: { findFirst: async () => null } };
  const svc = new EventReportsService(prisma as unknown as PrismaService);
  await assert.rejects(() => svc.getEventParticipants(TENANT, 'e1'), /Evento não encontrado/);
});
