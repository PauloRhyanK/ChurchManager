import assert from 'node:assert/strict';
import test from 'node:test';
import { SchedulesService } from './schedules.service';

const row = {
  id: 's1',
  tenantId: 't1',
  title: 'Culto',
  dayOfWeek: 0,
  timeStart: new Date('1970-01-01T19:00:00Z'),
  location: null,
  description: null,
  active: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function build() {
  const notified: string[] = [];
  const prisma = {
    schedule: {
      create: async () => row,
      findFirst: async () => ({ id: 's1' }),
      update: async () => row,
      delete: async () => row,
    },
  };
  const svc = new SchedulesService(prisma as never, {
    notifyContentChanged: (t: string) => notified.push(t),
  } as never);
  return { svc, notified };
}

test('criar, editar e excluir horário disparam a revalidação do tenant', async () => {
  const { svc, notified } = build();
  await svc.createForTenant('t1', {
    title: 'Culto',
    dayOfWeek: 0,
    timeStart: '19:00',
  } as never);
  await svc.updateForTenant('t1', 's1', { title: 'Culto 2' } as never);
  await svc.removeForTenant('t1', 's1');
  assert.deepEqual(notified, ['t1', 't1', 't1']);
});
