import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventRegistrationsService } from './event-registrations.service';
import { EventTagsService } from './event-tags.service';
import { SchedulesService } from './schedules.service';

const tagsStub = {} as EventTagsService;

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVENT_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function createEventsPrismaMock(capture: { where?: unknown }) {
  return {
    event: {
      findMany: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return [];
      },
      findFirst: async ({ where }: { where: { id?: string; tenantId?: string } }) => {
        capture.where = where;
          if (where.tenantId === TENANT_A && where.id === EVENT_A) {
          return {
            id: EVENT_A,
            tenantId: TENANT_A,
            title: 'Evento A',
            description: null,
            format: 'IN_PERSON',
            onlineUrl: null,
            shortDescription: null,
            detailsHtml: null,
            videoUrl: null,
            coverImageUrl: null,
            mediaMeta: null,
            date: new Date(Date.UTC(2026, 6, 1)),
            timeStart: null,
            timeEnd: null,
            location: null,
            imageUrl: null,
            tag: null,
            tags: [],
            published: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      },
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({}),
    },
  };
}

test('isolation: EventsService.listForTenant filtra por tenantId', async () => {
  const capture: { where?: unknown } = {};
  const service = new EventsService(
    createEventsPrismaMock(capture) as never,
    tagsStub,
  );
  await service.listForTenant(TENANT_A, { publishedOnly: true });
  assert.deepEqual(capture.where, {
    tenantId: TENANT_A,
    published: true,
  });
});

test('isolation: EventsService.getForTenant devolve 404 se evento é de outro tenant', async () => {
  const capture: { where?: unknown } = {};
  const service = new EventsService(
    createEventsPrismaMock(capture) as never,
    tagsStub,
  );
  await assert.rejects(
    () => service.getForTenant(TENANT_B, EVENT_A),
    (err: unknown) => err instanceof NotFoundException,
  );
  assert.deepEqual(capture.where, { id: EVENT_A, tenantId: TENANT_B });
});

test('isolation: EventRegistrationsService.listForEvent exige evento do tenant', async () => {
  const capture: { where?: unknown } = {};
  const prisma = {
    event: {
      findFirst: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return null;
      },
    },
    eventRegistration: { findMany: async () => [] },
  };
  const service = new EventRegistrationsService(prisma as never);
  await assert.rejects(
    () => service.listForEvent(TENANT_B, EVENT_A),
    (err: unknown) => err instanceof NotFoundException,
  );
  assert.deepEqual(capture.where, { id: EVENT_A, tenantId: TENANT_B });
});

test('isolation: SchedulesService.listForTenant filtra por tenantId', async () => {
  const capture: { where?: unknown } = {};
  const prisma = {
    schedule: {
      findMany: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return [];
      },
    },
  };
  const service = new SchedulesService(prisma as never);
  await service.listForTenant(TENANT_A, true);
  assert.deepEqual(capture.where, { tenantId: TENANT_A, active: true });
});

test('isolation: EventRegistrationsService.createForEvent grava tenantId do destino', async () => {
  let createData: unknown;
  const prisma = {
    event: {
      findFirst: async () => ({ id: EVENT_A }),
    },
    eventRegistration: {
      create: async ({ data }: { data: unknown }) => {
        createData = data;
        return {
          id: 'reg-1',
          tenantId: TENANT_A,
          eventId: EVENT_A,
          name: 'Test',
          email: 'a@b.com',
          phone: null,
          message: null,
          userId: null,
          createdAt: new Date(),
        };
      },
    },
  };
  const service = new EventRegistrationsService(prisma as never);
  await service.createForEvent(TENANT_A, EVENT_A, {
    name: 'Test',
    email: 'A@B.com',
  });
  assert.deepEqual(createData, {
    tenantId: TENANT_A,
    eventId: EVENT_A,
    name: 'Test',
    email: 'a@b.com',
    phone: null,
    message: null,
    userId: null,
  });
});
