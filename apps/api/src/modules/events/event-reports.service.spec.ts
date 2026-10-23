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
