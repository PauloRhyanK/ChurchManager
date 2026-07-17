import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EventTicketTypesService } from './event-ticket-types.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TYPE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTOR = { userId: 'uuuu', email: 'voluntario@igreja.com' };

function service(prisma: unknown, ticketTypes: unknown = {}) {
  return new CheckinService(
    prisma as PrismaService,
    ticketTypes as EventTicketTypesService,
  );
}

test('checkIn rejeita ingresso que já deu entrada', async () => {
  const svc = service({
    eventTicket: {
      findFirst: async () => ({
        id: 't1',
        tenantId: TENANT,
        status: 'VALID',
        checkedInAt: new Date(),
        checkedInByName: 'outro@igreja.com',
      }),
    },
  });
  await assert.rejects(
    () => svc.checkIn(TENANT, 't1', ACTOR),
    ConflictException,
  );
});

test('checkIn rejeita ingresso não válido', async () => {
  const svc = service({
    eventTicket: {
      findFirst: async () => ({
        id: 't1',
        tenantId: TENANT,
        status: 'CANCELLED',
        checkedInAt: null,
      }),
    },
  });
  await assert.rejects(
    () => svc.checkIn(TENANT, 't1', ACTOR),
    BadRequestException,
  );
});

test('checkIn marca presença com o voluntário', async () => {
  let updateArgs: any;
  const svc = service({
    eventTicket: {
      findFirst: async () => ({
        id: 't1',
        tenantId: TENANT,
        status: 'VALID',
        checkedInAt: null,
      }),
      update: async (args: any) => {
        updateArgs = args;
        return {
          id: 't1',
          publicCode: 'ABC',
          holderName: 'Maria',
          status: 'VALID',
          checkedInAt: new Date(),
          checkedInByName: ACTOR.email,
          orderId: 'o1',
          ticketType: { name: 'Gratuito' },
        };
      },
    },
  });
  const dto = await svc.checkIn(TENANT, 't1', ACTOR);
  assert.equal(updateArgs.data.checkedInByUserId, ACTOR.userId);
  assert.equal(updateArgs.data.checkedInByName, ACTOR.email);
  assert.equal(dto.holderName, 'Maria');
  assert.equal(dto.ticketTypeName, 'Gratuito');
});

test('checkIn com publicCode não-UUID não filtra pela coluna id', async () => {
  let capturedWhere: any;
  const svc = service({
    eventTicket: {
      findFirst: async (args: any) => {
        capturedWhere = args.where;
        return null;
      },
    },
  });
  await assert.rejects(() => svc.checkIn(TENANT, 'Jx9Abc_-code', ACTOR));
  // Só a cláusula publicCode — sem { id } (evita erro de cast para UUID).
  assert.deepEqual(capturedWhere.OR, [{ publicCode: 'Jx9Abc_-code' }]);
});

test('checkIn com UUID busca por id e publicCode', async () => {
  let capturedWhere: any;
  const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const svc = service({
    eventTicket: {
      findFirst: async (args: any) => {
        capturedWhere = args.where;
        return null;
      },
    },
  });
  await assert.rejects(() => svc.checkIn(TENANT, uuid, ACTOR));
  assert.deepEqual(capturedWhere.OR, [{ publicCode: uuid }, { id: uuid }]);
});

test('issueFreeTickets rejeita ingresso pago', async () => {
  const svc = service({
    event: { findFirst: async () => ({ id: EVENT, currency: 'BRL' }) },
    eventTicketType: {
      findFirst: async () => ({ id: TYPE, priceCents: 1000, feeCents: 0 }),
    },
  });
  await assert.rejects(
    () =>
      svc.issueFreeTickets(TENANT, EVENT, {
        ticketTypeId: TYPE,
        holderNames: ['João'],
      }),
    BadRequestException,
  );
});

test('issueFreeTickets emite um ingresso por nome', async () => {
  let reserveQty: number | undefined;
  let createdTickets: any[] = [];
  const ticketTypes = {
    reserveStock: async (_tx: unknown, _t: string, _id: string, qty: number) => {
      reserveQty = qty;
      return true;
    },
  };
  const svc = service(
    {
      event: { findFirst: async () => ({ id: EVENT, currency: 'BRL' }) },
      eventTicketType: {
        findFirst: async () => ({ id: TYPE, priceCents: 0, feeCents: 0 }),
      },
      eventTicket: {
        findMany: async () =>
          createdTickets.map((t, i) => ({
            id: `t${i}`,
            publicCode: t.publicCode,
            holderName: t.holderName,
            status: 'VALID',
            checkedInAt: null,
            checkedInByName: null,
            orderId: 'o1',
            ticketType: { name: 'Gratuito' },
          })),
      },
      $transaction: async (cb: any) =>
        cb({
          eventOrder: { create: async () => ({ id: 'o1' }) },
          eventTicket: {
            createMany: async ({ data }: any) => {
              createdTickets = data;
              return { count: data.length };
            },
          },
        }),
    },
    ticketTypes,
  );

  const res = await svc.issueFreeTickets(TENANT, EVENT, {
    ticketTypeId: TYPE,
    holderNames: ['João', 'Maria', '  '],
  });
  assert.equal(reserveQty, 2); // nomes vazios filtrados
  assert.equal(createdTickets.length, 2);
  assert.deepEqual(
    createdTickets.map((t) => t.holderName),
    ['João', 'Maria'],
  );
  assert.equal(res.tickets.length, 2);
});
