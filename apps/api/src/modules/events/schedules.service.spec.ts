import assert from 'node:assert/strict';
import test from 'node:test';
import { SchedulesService } from './schedules.service';

function scheduleRow(
  id: string,
  dayOfWeek: string,
  time: string,
  sortOrder = 0,
) {
  return {
    id,
    tenantId: 't1',
    title: id,
    dayOfWeek,
    timeStart: new Date(`1970-01-01T${time}Z`),
    location: null,
    description: null,
    active: true,
    sortOrder,
    createdAt: new Date(),
  };
}

test('listForTenant ordena por sortOrder, dia da semana (Domingo→Sábado) e horário', async () => {
  let findManyArgs: { orderBy?: unknown } = {};
  // Fora de ordem de propósito: a ordenação final é feita em JS.
  const rows = [
    scheduleRow('quarta-19h', 'Quarta', '19:30:00', 1),
    scheduleRow('domingo-19h', 'Domingo', '19:00:00', 1),
    scheduleRow('fim-da-lista', 'Domingo', '08:00:00', 5),
    scheduleRow('sabado-10h', 'Sábado', '10:00:00', 1),
    scheduleRow('domingo-09h', 'Domingo', '09:00:00', 1),
    scheduleRow('segunda-20h', 'Segunda', '20:00:00', 1),
    scheduleRow('destaque', 'Sexta', '20:00:00', 0),
  ];
  const prisma = {
    schedule: {
      findMany: async (args: { orderBy?: unknown }) => {
        findManyArgs = args;
        return rows;
      },
    },
  };
  const svc = new SchedulesService(prisma as never, {
    notifyContentChanged: () => {},
  } as never);

  const items = await svc.listForTenant('t1', true);

  assert.deepEqual(findManyArgs.orderBy, { sortOrder: 'asc' });
  assert.deepEqual(
    items.map((i) => i.id),
    [
      'destaque',
      'domingo-09h',
      'domingo-19h',
      'segunda-20h',
      'quarta-19h',
      'sabado-10h',
      'fim-da-lista',
    ],
  );
});

test('listForTenant mantém a ordem original entre horários empatados e põe dias desconhecidos no fim', async () => {
  const rows = [
    scheduleRow('legado', 'sunday', '09:00:00'),
    scheduleRow('domingo-a', 'Domingo', '10:00:00'),
    scheduleRow('domingo-b', 'Domingo', '10:00:00'),
  ];
  const prisma = { schedule: { findMany: async () => rows } };
  const svc = new SchedulesService(prisma as never, {
    notifyContentChanged: () => {},
  } as never);

  const items = await svc.listForTenant('t1');

  assert.deepEqual(
    items.map((i) => i.id),
    ['domingo-a', 'domingo-b', 'legado'],
  );
});
