import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/service.dto';
import { DEFAULT_TEMPLATE } from './service-schedule';
import { WorshipServicesService } from './worship-services.service';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMPLATE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SERVICE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const MOMENTS = [
  { name: 'Louvor', kind: 'WORSHIP', durationMinutes: 20 },
  { name: 'Palavra', kind: 'SERMON', durationMinutes: 45 },
];

function build(saved = true) {
  const writes: { op: string; data?: Record<string, unknown> }[] = [];
  const row = { id: TEMPLATE, tenantId: TENANT_B, name: 'Domingo à noite', startTime: '19:00', moments: MOMENTS };
  const prisma = {
    worshipServiceTemplate: {
      findMany: async ({ where }: { where: { tenantId: string } }) => (saved && where.tenantId === TENANT_B ? [row] : []),
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        saved && where.id === TEMPLATE && where.tenantId === TENANT_B ? row : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ op: 'create', data });
        return { id: 'novo', ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ op: 'update', data });
        return { ...row, ...data };
      },
      delete: async () => {
        writes.push({ op: 'delete' });
        return row;
      },
    },
    worshipService: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === SERVICE && where.tenantId === TENANT_B
          ? { id: SERVICE, tenantId: TENANT_B, startTime: '10:00', moments: [{ id: 'm', ...MOMENTS[0], sortOrder: 0 }], songs: [] }
          : null,
    },
  };
  const deliveries = { summaries: async () => new Map() };
  return { svc: new WorshipServicesService(prisma as never, deliveries as never), writes };
}

test('lista: sem modelo salvo vem o Culto padrão embutido; com modelo salvo, só os da igreja', async () => {
  const vazio = await build(false).svc.listTemplates(TENANT_B);
  assert.deepEqual(vazio.items, [{ id: null, ...DEFAULT_TEMPLATE }]);
  const cheio = await build().svc.listTemplates(TENANT_B);
  assert.deepEqual(cheio.items.map((t) => [t.id, t.name]), [[TEMPLATE, 'Domingo à noite']]);
  assert.deepEqual((await build().svc.listTemplates(TENANT_A)).items.map((t) => t.id), [null], 'outra igreja não vê os modelos desta');
});

test('criar do zero grava nome, horário e momentos; sem horário vale 19:00', async () => {
  const { svc, writes } = build();
  const out = await svc.createTemplate(TENANT_B, { name: 'Quarta', startTime: '19:30', moments: MOMENTS as never });
  assert.deepEqual(writes[0].data, { tenantId: TENANT_B, name: 'Quarta', startTime: '19:30', moments: MOMENTS });
  assert.deepEqual(out.moments, MOMENTS);
  const semHora = build();
  await semHora.svc.createTemplate(TENANT_B, { name: 'Quarta', moments: MOMENTS as never });
  assert.equal(semHora.writes[0].data?.startTime, '19:00');
});

test('criar a partir de um culto continua funcionando e copia o horário dele', async () => {
  const { svc, writes } = build();
  await svc.createTemplate(TENANT_B, { name: 'Manhã', fromServiceId: SERVICE });
  assert.equal(writes[0].data?.startTime, '10:00');
  assert.deepEqual(writes[0].data?.moments, [MOMENTS[0]]);
});

test('criar sem origem nem momentos, ou com os dois, responde 400 e não grava', async () => {
  const { svc, writes } = build();
  await assert.rejects(svc.createTemplate(TENANT_B, { name: 'x' }), BadRequestException);
  await assert.rejects(
    svc.createTemplate(TENANT_B, { name: 'x', fromServiceId: SERVICE, moments: MOMENTS as never }),
    BadRequestException,
  );
  await assert.rejects(svc.createTemplate(TENANT_A, { name: 'x', fromServiceId: SERVICE }), NotFoundException);
  assert.deepEqual(writes, []);
});

test('editar: só o que veio é alterado, e a lista de momentos é trocada inteira', async () => {
  const { svc, writes } = build();
  await svc.updateTemplate(TENANT_B, TEMPLATE, { name: 'Domingo 19h' });
  assert.deepEqual(writes[0].data, { name: 'Domingo 19h' });
  const novo = [{ name: 'Abertura', kind: 'GENERIC', durationMinutes: 5 }];
  const out = await svc.updateTemplate(TENANT_B, TEMPLATE, { startTime: '18:00', moments: novo as never });
  assert.deepEqual(writes[1].data, { startTime: '18:00', moments: novo });
  assert.deepEqual(out.moments, novo);
});

test('modelo de outra igreja: editar e excluir respondem 404 e nada é escrito', async () => {
  const { svc, writes } = build();
  await assert.rejects(svc.updateTemplate(TENANT_A, TEMPLATE, { name: 'x' }), NotFoundException);
  await assert.rejects(svc.removeTemplate(TENANT_A, TEMPLATE), NotFoundException);
  assert.deepEqual(writes, []);
  const dono = build();
  await dono.svc.removeTemplate(TENANT_B, TEMPLATE);
  assert.deepEqual(dono.writes.map((w) => w.op), ['delete']);
});

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
const parse = <T>(metatype: Type<T>, body: unknown) => pipe.transform(body, { type: 'body', metatype }) as Promise<T>;
const rejects = (metatype: Type<unknown>, body: unknown) => assert.rejects(parse(metatype, body), BadRequestException);

test('DTO dos modelos: whitelist, tipos e limites', async () => {
  const ok = await parse(CreateTemplateDto, { name: ' Quarta ', startTime: '19:30', moments: MOMENTS });
  assert.equal(ok.name, 'Quarta');
  await parse(CreateTemplateDto, { name: 'x', fromServiceId: SERVICE });
  await parse(UpdateTemplateDto, { moments: MOMENTS });
  await parse(UpdateTemplateDto, {});
  for (const dto of [CreateTemplateDto, UpdateTemplateDto]) {
    await rejects(dto, { name: 'x', moments: [] });
    await rejects(dto, { name: 'x', moments: [{ name: 'Show', kind: 'SHOW', durationMinutes: 5 }] });
    await rejects(dto, { name: 'x', moments: [{ name: '', kind: 'GENERIC', durationMinutes: 5 }] });
    await rejects(dto, { name: 'x', moments: [{ name: 'a', kind: 'GENERIC', durationMinutes: 0 }] });
    await rejects(dto, { name: 'x', moments: [{ name: 'a', kind: 'GENERIC', durationMinutes: 5, id: SERVICE }] });
    await rejects(dto, { name: 'x', moments: [{ name: 'a', kind: 'GENERIC', durationMinutes: 5, startsAt: '19:00' }] });
    await rejects(dto, { name: 'x', startTime: '7pm', moments: MOMENTS });
    await rejects(dto, { name: 'x', tenantId: TENANT_A, moments: MOMENTS });
    await rejects(dto, { name: 'x', id: TEMPLATE, moments: MOMENTS });
    await rejects(dto, { name: 'x', moments: Array.from({ length: 41 }, () => MOMENTS[0]) });
    await rejects(dto, { name: '   ', moments: MOMENTS });
  }
  await rejects(CreateTemplateDto, { moments: MOMENTS });
});
