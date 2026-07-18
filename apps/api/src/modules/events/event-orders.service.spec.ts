import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { EventOrdersService } from './event-orders.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EventTicketTypesService } from './event-ticket-types.service';
import type { TicketDeliveryService } from './ticket-delivery.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function service(prisma: unknown, delivery: unknown = {}) {
  return new EventOrdersService(
    prisma as PrismaService,
    {} as EventTicketTypesService,
    delivery as TicketDeliveryService,
  );
}

test('getPublicTicket com publicCode não-UUID não filtra pela coluna id', async () => {
  let capturedWhere: any;
  const svc = service({
    eventTicket: {
      findFirst: async (args: any) => {
        capturedWhere = args.where;
        return null;
      },
    },
  });
  // Não pode lançar P2023 (cast inválido para UUID); só resolve como NotFound.
  await assert.rejects(
    () => svc.getPublicTicket(TENANT, 'Jx9Abc_-code'),
    NotFoundException,
  );
  // Só a cláusula publicCode — sem { id } (evita erro de cast para UUID).
  assert.deepEqual(capturedWhere.OR, [{ publicCode: 'Jx9Abc_-code' }]);
});

test('getPublicTicket com UUID busca por id e publicCode', async () => {
  let capturedWhere: any;
  const uuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const svc = service({
    eventTicket: {
      findFirst: async (args: any) => {
        capturedWhere = args.where;
        return null;
      },
    },
  });
  await assert.rejects(
    () => svc.getPublicTicket(TENANT, uuid),
    NotFoundException,
  );
  assert.deepEqual(capturedWhere.OR, [{ publicCode: uuid }, { id: uuid }]);
});
