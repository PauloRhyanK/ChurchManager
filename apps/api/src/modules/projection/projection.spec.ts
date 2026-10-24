import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AdminUserRole,
  AdminUserStatus,
  PermissionLevel,
  PermissionModule,
} from '@prisma/client';
import { PermissionsGuard } from '../access/permissions.guard';
import type { AuthUser } from '../auth/auth-user';
import { buildProjectionAgenda } from './projection-agenda';
import { ProjectionService } from './projection.service';
import { TenantsMeProjectionController } from './tenants-me-projection.controller';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// Sábado, 24/10/2026 (date-only, como `startOfTodayInTimeZone`).
const TODAY = new Date(Date.UTC(2026, 9, 24));

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function schedule(id: string, dayOfWeek: string, hhmm: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Culto ${id}`,
    dayOfWeek,
    timeStart: time(hhmm),
    location: null,
    description: null,
    active: true,
    ...extra,
  };
}

function event(id: string, iso: string, hhmm: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: ` Evento ${id} `,
    date: day(iso),
    timeStart: hhmm ? time(hhmm) : null,
    timeEnd: null,
    location: 'Sede',
    shortDescription: 'Traga um amigo',
    published: true,
    ...extra,
  };
}

const base = { today: TODAY, hiddenEventIds: [], hiddenScheduleIds: [] };

test('horário semanal vira uma ocorrência por dia certo nos próximos 7 dias', () => {
  const items = buildProjectionAgenda({
    ...base,
    schedules: [schedule('dom', 'Domingo', '09:00'), schedule('sab', 'Sábado', '19:00')],
    events: [],
  });
  assert.deepEqual(
    items.map((i) => [i.key, i.date, i.timeStart]),
    [
      ['schedule:sab:2026-10-24', '2026-10-24', '19:00'],
      ['schedule:dom:2026-10-25', '2026-10-25', '09:00'],
    ],
  );
  assert.equal(items[0].kind, 'schedule');
  assert.equal(items[0].sourceId, 'sab');
});

test('7 dias começando hoje: o sábado seguinte (dia 8) fica de fora', () => {
  const items = buildProjectionAgenda({ ...base, schedules: [schedule('sab', 'Sábado', '19:00')], events: [] });
  assert.deepEqual(items.map((i) => i.date), ['2026-10-24']);
});

test('horário inativo, dia desconhecido e evento não publicado ou passado ficam fora', () => {
  const items = buildProjectionAgenda({
    ...base,
    schedules: [
      schedule('off', 'Domingo', '09:00', { active: false }),
      schedule('legado', 'Domingo-feira', '09:00'),
    ],
    events: [
      event('rascunho', '2026-10-25', '10:00', { published: false }),
      event('ontem', '2026-10-23', '10:00'),
    ],
  });
  assert.deepEqual(items, []);
});

test('eventos e horários se misturam por data e hora; sem horário primeiro; evento antes de horário no empate', () => {
  const items = buildProjectionAgenda({
    ...base,
    schedules: [schedule('dom', 'Domingo', '09:00'), schedule('dom2', 'Domingo', '18:30')],
    events: [
      event('tarde', '2026-10-25', '15:00'),
      event('diaTodo', '2026-10-25', null),
      event('mesmoHorario', '2026-10-25', '09:00'),
      event('longe', '2026-11-20', '20:00'),
    ],
  });
  assert.deepEqual(
    items.map((i) => i.key),
    [
      'event:diaTodo',
      'event:mesmoHorario',
      'schedule:dom:2026-10-25',
      'event:tarde',
      'schedule:dom2:2026-10-25',
      'event:longe',
    ],
  );
});

test('campos do item: título aparado, nota do evento e descrição do horário', () => {
  const [ev, sch] = buildProjectionAgenda({
    ...base,
    schedules: [schedule('dom', 'Domingo', '09:00', { description: 'Ceia', location: 'Templo' })],
    events: [event('e1', '2026-10-24', '20:00', { timeEnd: time('22:00') })],
  });
  assert.deepEqual(ev, {
    key: 'event:e1',
    kind: 'event',
    sourceId: 'e1',
    title: 'Evento e1',
    date: '2026-10-24',
    timeStart: '20:00',
    timeEnd: '22:00',
    location: 'Sede',
    note: 'Traga um amigo',
    hidden: false,
  });
  assert.equal(sch.note, 'Ceia');
  assert.equal(sch.location, 'Templo');
  assert.equal(sch.timeEnd, null);
});

test('ocultos ficam marcados; ocultar um horário marca todas as ocorrências', () => {
  const items = buildProjectionAgenda({
    today: TODAY,
    schedules: [schedule('sab', 'Sábado', '19:00'), schedule('dom', 'Domingo', '09:00')],
    events: [event('e1', '2026-10-24', '20:00')],
    hiddenEventIds: ['e1', 'apagado'],
    hiddenScheduleIds: ['sab'],
    days: 14,
  });
  const hidden = items.filter((i) => i.hidden).map((i) => i.key);
  assert.deepEqual(hidden, ['schedule:sab:2026-10-24', 'event:e1', 'schedule:sab:2026-10-31']);
});

function createService(stored: { hiddenEventIds: string[]; hiddenScheduleIds: string[] } | null) {
  const capture: Record<string, unknown> = {};
  const prisma = {
    schedule: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capture[`schedule:${JSON.stringify(args.where)}`] = true;
        if ('id' in args.where) {
          const ids = (args.where.id as { in: string[] }).in;
          return ids.filter((id) => ['sab', 'pausado'].includes(id)).map((id) => ({ id }));
        }
        return [schedule('sab', 'Sábado', '19:00')];
      },
    },
    event: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capture.eventWhere = args.where;
        if ('id' in args.where) {
          const ids = (args.where.id as { in: string[] }).in;
          return ids.filter((id) => id === 'e1').map((id) => ({ id }));
        }
        return [event('e1', '2026-10-24', '20:00')];
      },
    },
    projectionSettings: {
      findUnique: async ({ where }: { where: unknown }) => {
        capture.settingsWhere = where;
        return stored ? { ...stored, updatedAt: new Date('2026-10-24T12:00:00.000Z') } : null;
      },
      upsert: async (args: { where: unknown; create: unknown; update: unknown }) => {
        capture.upsert = args;
        stored = args.update as typeof stored;
        return { ...(args.update as object), updatedAt: new Date('2026-10-24T12:00:00.000Z') };
      },
    },
  };
  const revalidation = {
    notifyContentChanged: (tenantId: string) => {
      capture.notified = tenantId;
    },
  };
  return { service: new ProjectionService(prisma as never, revalidation as never), capture };
}

// 24/10/2026 às 22h em São Paulo = 25/10 01h em UTC: "hoje" tem de ser 24.
const NIGHT_IN_SP = new Date('2026-10-25T01:00:00.000Z');

test('service: "hoje" é o dia de São Paulo e a busca é por tenant', async () => {
  const { service, capture } = createService(null);
  const agenda = await service.getAgendaForTenant(TENANT, NIGHT_IN_SP);
  assert.deepEqual(capture.eventWhere, { tenantId: TENANT, published: true, date: { gte: TODAY } });
  assert.deepEqual(capture.settingsWhere, { tenantId: TENANT });
  assert.equal(agenda.days, 7);
  assert.equal(agenda.updatedAt, null);
  assert.deepEqual(agenda.items.map((i) => i.key)[0], 'schedule:sab:2026-10-24');
});

test('service: público remove ocultos e o campo hidden', async () => {
  const { service } = createService({ hiddenEventIds: ['e1'], hiddenScheduleIds: [] });
  const { items } = await service.getPublicAgenda(TENANT, NIGHT_IN_SP);
  assert.deepEqual(items.map((i) => i.key), ['schedule:sab:2026-10-24']);
  assert.equal('hidden' in items[0], false);
});

test('service: salvar mantém ocultos que estão fora da agenda agora (desativado, despublicado)', async () => {
  const { service, capture } = createService({ hiddenEventIds: ['e1'], hiddenScheduleIds: ['pausado'] });
  await service.updateSettingsForTenant(TENANT, { hiddenEventIds: [], hiddenScheduleIds: [] }, NIGHT_IN_SP);
  const upsert = capture.upsert as { update: { hiddenEventIds: string[]; hiddenScheduleIds: string[] } };
  // e1 está na agenda e foi religado; "pausado" não está na agenda, então continua oculto.
  assert.deepEqual(upsert.update, { hiddenEventIds: [], hiddenScheduleIds: ['pausado'] });
});

test('service: salvar descarta ids que não são do tenant, remove repetidos e revalida', async () => {
  const { service, capture } = createService(null);
  const agenda = await service.updateSettingsForTenant(
    TENANT,
    { hiddenEventIds: ['e1', 'e1', 'de-outra-igreja'], hiddenScheduleIds: ['sab', 'x'] },
    NIGHT_IN_SP,
  );
  assert.deepEqual(capture.upsert, {
    where: { tenantId: TENANT },
    create: { tenantId: TENANT, hiddenEventIds: ['e1'], hiddenScheduleIds: ['sab'] },
    update: { hiddenEventIds: ['e1'], hiddenScheduleIds: ['sab'] },
  });
  assert.equal(capture.notified, TENANT);
  assert.equal(agenda.items.every((i) => i.hidden), true);
});

function member(level?: PermissionLevel): AuthUser {
  return {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'demo',
    email: 'a@b.c',
    role: AdminUserRole.TENANT_MEMBER,
    status: AdminUserStatus.ACTIVE,
    permissions: level ? { [PermissionModule.SITE]: level } : {},
  };
}

function check(method: string, user: AuthUser): boolean {
  const proto = TenantsMeProjectionController.prototype as unknown as Record<string, unknown>;
  const ctx = {
    getHandler: () => proto[method],
    getClass: () => TenantsMeProjectionController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  return new PermissionsGuard(new Reflector()).canActivate(ctx as never);
}

test('permissões: SITE:VIEW vê a agenda, só SITE:EDIT salva', () => {
  assert.equal(check('getAgenda', member(PermissionLevel.VIEW)), true);
  assert.throws(() => check('updateSettings', member(PermissionLevel.VIEW)), ForbiddenException);
  assert.equal(check('updateSettings', member(PermissionLevel.EDIT)), true);
  assert.throws(() => check('getAgenda', member()), ForbiddenException);
});
