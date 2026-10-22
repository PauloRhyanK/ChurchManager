import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventRegistrationsService } from './event-registrations.service';
import { EventTicketTypesService } from './event-ticket-types.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TICKET = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: EVENT,
    published: true,
    date: new Date(Date.UTC(2999, 0, 1)),
    timezone: 'America/Sao_Paulo',
    ...over,
  };
}

function ticketRow(over: Record<string, unknown> = {}) {
  return {
    id: TICKET,
    tenantId: TENANT,
    eventId: EVENT,
    name: 'Gratuito',
    priceCents: 0,
    feeCents: 0,
    quantityTotal: null,
    quantitySold: 0,
    salesOpensAt: null,
    salesClosesAt: null,
    active: true,
    allowGuestRegistration: true,
    communityLink: 'https://chat.whatsapp.com/abc',
    fieldConfigs: [],
    ...over,
  };
}

type Options = {
  event?: Record<string, unknown> | null;
  ticket?: Record<string, unknown> | null;
  /** Linhas afetadas pelo UPDATE condicional de estoque (0 = corrida perdida). */
  reserveAffected?: number;
};

function build(options: Options = {}) {
  const event = options.event === undefined ? eventRow() : options.event;
  const ticket = options.ticket === undefined ? ticketRow() : options.ticket;
  const log: string[] = [];
  const created: Array<Record<string, unknown>> = [];
  const stockUpdates: Array<{ sql: string; values: unknown[] }> = [];
  const eventQueries: unknown[] = [];

  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      log.push('reserva-estoque');
      stockUpdates.push({ sql: strings.join('?'), values });
      return options.reserveAffected ?? 1;
    },
    eventRegistration: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        log.push('cria-inscricao');
        created.push(data);
        return {
          id: 'reg-1',
          tenantId: TENANT,
          eventId: EVENT,
          name: data.name,
          email: data.email,
          phone: null,
          message: null,
          userId: null,
          createdAt: new Date(),
        };
      },
    },
  };
  const prisma = {
    event: {
      findFirst: async (args: unknown) => {
        eventQueries.push(args);
        return event;
      },
    },
    eventTicketType: { findFirst: async () => ticket },
    eventRegistration: {
      create: async () => {
        throw new Error('a inscrição deve ser criada dentro da transação');
      },
    },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
      log.push('inicio-transacao');
      const result = await fn(tx);
      log.push('fim-transacao');
      return result;
    },
  };
  const service = new EventRegistrationsService(
    prisma as never,
    new EventTicketTypesService(prisma as never),
  );
  return { service, log, created, stockUpdates, eventQueries };
}

const body = { name: 'Maria', email: 'Maria@Exemplo.com' };
const bodyWithTicket = { ...body, ticketTypeId: TICKET };

function rejectsWith(
  type: new (...args: never[]) => Error,
  message: string,
): (err: unknown) => boolean {
  return (err: unknown) => {
    assert.ok(err instanceof type, `esperava ${type.name}, recebeu ${String(err)}`);
    assert.equal(err.message, message);
    return true;
  };
}

test('createForEvent: evento inexistente responde 404', async () => {
  const { service, created } = build({ event: null });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, body),
    rejectsWith(NotFoundException, 'Evento não encontrado'),
  );
  assert.equal(created.length, 0);
});

test('createForEvent: evento não publicado responde 404 (não revela rascunho)', async () => {
  const { service, created, eventQueries } = build({
    event: eventRow({ published: false }),
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, body),
    rejectsWith(NotFoundException, 'Evento não encontrado'),
  );
  assert.equal(created.length, 0);
  assert.deepEqual(
    (eventQueries[0] as { where: unknown }).where,
    { id: EVENT, tenantId: TENANT },
  );
});

test('createForEvent: evento passado responde 400', async () => {
  const { service, created } = build({
    event: eventRow({ date: new Date(Date.UTC(2000, 0, 1)) }),
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, body),
    rejectsWith(
      BadRequestException,
      'As inscrições para este evento foram encerradas',
    ),
  );
  assert.equal(created.length, 0);
});

test('createForEvent: evento de hoje aceita inscrição às 21h30 de Brasília', async (t) => {
  // 21:30 BRT do dia 22 = 00:30 UTC do dia 23.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T00:30:00Z') });
  const { service, created } = build({
    event: eventRow({ date: new Date(Date.UTC(2026, 9, 22)) }),
  });
  await service.createForEvent(TENANT, EVENT, body);
  assert.equal(created.length, 1);
});

test('createForEvent: ingresso pago responde 400', async () => {
  const { service, created, stockUpdates } = build({
    ticket: ticketRow({ priceCents: 1000 }),
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(
      BadRequestException,
      'Este ingresso é pago. Use o checkout para comprar.',
    ),
  );
  assert.equal(created.length, 0);
  assert.equal(stockUpdates.length, 0);
});

test('createForEvent: ingresso com só taxa também é pago', async () => {
  const { service } = build({ ticket: ticketRow({ feeCents: 150 }) });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(
      BadRequestException,
      'Este ingresso é pago. Use o checkout para comprar.',
    ),
  );
});

test('createForEvent: ingresso inativo responde 404', async () => {
  const { service, created } = build({ ticket: ticketRow({ active: false }) });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(NotFoundException, 'Tipo de ingresso não encontrado'),
  );
  assert.equal(created.length, 0);
});

test('createForEvent: ingresso com vendas encerradas responde 400', async () => {
  const { service, created } = build({
    ticket: ticketRow({ salesClosesAt: new Date(Date.UTC(2000, 0, 1)) }),
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(
      BadRequestException,
      'Este ingresso não está disponível para inscrição',
    ),
  );
  assert.equal(created.length, 0);
});

test('createForEvent: ingresso com vendas ainda não abertas responde 400', async () => {
  const { service } = build({
    ticket: ticketRow({ salesOpensAt: new Date(Date.UTC(2999, 0, 1)) }),
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(
      BadRequestException,
      'Este ingresso não está disponível para inscrição',
    ),
  );
});

test('createForEvent: ingresso esgotado responde 409', async () => {
  const { service, created, stockUpdates } = build({
    ticket: ticketRow({ quantityTotal: 10, quantitySold: 10 }),
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(ConflictException, 'Ingressos esgotados'),
  );
  assert.equal(created.length, 0);
  assert.equal(stockUpdates.length, 0);
});

test('createForEvent: sucesso com ingresso incrementa quantitySold na mesma transação', async () => {
  const { service, log, created, stockUpdates } = build({
    ticket: ticketRow({ quantityTotal: 10, quantitySold: 9 }),
  });
  const result = await service.createForEvent(TENANT, EVENT, bodyWithTicket);

  assert.deepEqual(log, [
    'inicio-transacao',
    'reserva-estoque',
    'cria-inscricao',
    'fim-transacao',
  ]);
  assert.equal(stockUpdates.length, 1);
  assert.match(stockUpdates[0].sql, /SET quantity_sold = quantity_sold \+ \?/);
  assert.match(stockUpdates[0].sql, /quantity_sold \+ \? <= quantity_total/);
  assert.deepEqual(stockUpdates[0].values, [1, TICKET, TENANT, 1]);
  assert.equal(created.length, 1);
  assert.equal(created[0].email, 'maria@exemplo.com');
  assert.equal(result.communityLink, 'https://chat.whatsapp.com/abc');
});

test('createForEvent: corrida perdida no estoque responde 409 sem criar inscrição', async () => {
  const { service, created } = build({
    ticket: ticketRow({ quantityTotal: 10, quantitySold: 9 }),
    reserveAffected: 0,
  });
  await assert.rejects(
    () => service.createForEvent(TENANT, EVENT, bodyWithTicket),
    rejectsWith(ConflictException, 'Ingressos esgotados'),
  );
  assert.equal(created.length, 0);
});

test('createForEvent: sem ingresso não mexe no estoque', async () => {
  const { service, created, stockUpdates } = build();
  const result = await service.createForEvent(TENANT, EVENT, body);
  assert.equal(created.length, 1);
  assert.equal(stockUpdates.length, 0);
  assert.equal(result.communityLink, null);
});
