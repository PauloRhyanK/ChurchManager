import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import { UpdateProjectionSettingsDto } from './dto/update-projection-settings.dto';
import { ProjectionService } from './projection.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOPIC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-10-24T15:00:00.000Z');

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function errors(body: unknown): Promise<string[] | null> {
  try {
    await pipe.transform(body, { type: 'body', metatype: UpdateProjectionSettingsDto });
    return null;
  } catch (err) {
    assert.ok(err instanceof BadRequestException);
    return (err.getResponse() as { message: string[] }).message;
  }
}

const base = { hiddenEventIds: [], hiddenScheduleIds: [] };
const celulas = { title: 'Células', text: 'Encontre uma célula perto de você', callToAction: 'Procure a recepção', active: true };

test('DTO: aceita tópicos válidos e continua aceitando corpo sem topics', async () => {
  assert.equal(await errors({ ...base, topics: [celulas, { ...celulas, id: TOPIC_ID, callToAction: null }] }), null);
  assert.equal(await errors(base), null);
});

test('DTO: rejeita campo extra no tópico, título longo, sem frase e mais de 20 tópicos', async () => {
  assert.notEqual(await errors({ ...base, topics: [{ ...celulas, cor: 'azul' }] }), null);
  assert.notEqual(await errors({ ...base, topics: [{ ...celulas, title: 'x'.repeat(61) }] }), null);
  assert.notEqual(await errors({ ...base, topics: [{ ...celulas, text: '' }] }), null);
  assert.notEqual(await errors({ ...base, topics: [{ ...celulas, id: 'nao-uuid' }] }), null);
  assert.notEqual(await errors({ ...base, topics: Array.from({ length: 21 }, () => celulas) }), null);
});

function createService(stored: Record<string, unknown> | null) {
  const capture: Record<string, unknown> = {};
  const prisma = {
    schedule: { findMany: async () => [] },
    event: { findMany: async () => [] },
    projectionSettings: {
      findUnique: async () => (stored ? { hiddenEventIds: [], hiddenScheduleIds: [], updatedAt: NOW, ...stored } : null),
      upsert: async (args: { update: Record<string, unknown> }) => {
        capture.update = args.update;
        stored = { ...(stored ?? {}), ...args.update };
        return { ...stored, updatedAt: NOW };
      },
    },
  };
  return {
    service: new ProjectionService(prisma as never, { notifyContentChanged: () => {} } as never),
    capture,
  };
}

const STORED_TOPICS = [
  { id: TOPIC_ID, title: 'Células', text: 'Encontre uma', callToAction: 'Recepção', active: true },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Batismo', text: 'Inscreva-se', callToAction: null, active: false },
];

test('painel recebe todos os tópicos; público só os ativos, sem o campo active', async () => {
  const { service } = createService({ topics: STORED_TOPICS });
  const agenda = await service.getAgendaForTenant(TENANT, NOW);
  assert.deepEqual(agenda.topics, STORED_TOPICS);
  const pub = await service.getPublicAgenda(TENANT, NOW);
  assert.deepEqual(pub.topics, [{ id: TOPIC_ID, title: 'Células', text: 'Encontre uma', callToAction: 'Recepção' }]);
});

test('sem configuração salva, topics é lista vazia', async () => {
  const { service } = createService(null);
  assert.deepEqual((await service.getAgendaForTenant(TENANT, NOW)).topics, []);
  assert.deepEqual((await service.getPublicAgenda(TENANT, NOW)).topics, []);
});

test('salvar: tópico novo ganha id, textos aparados, chamada vazia vira null, ordem mantida', async () => {
  const { service, capture } = createService(null);
  await service.updateSettingsForTenant(
    TENANT,
    {
      ...base,
      topics: [
        { title: '  Células ', text: ' Encontre  uma célula ', callToAction: '  ', active: true },
        { id: TOPIC_ID, title: 'Batismo', text: 'Inscreva-se', callToAction: 'Fale com o pastor', active: false },
      ],
    },
    NOW,
  );
  const topics = (capture.update as { topics: Array<Record<string, unknown>> }).topics;
  assert.equal(topics.length, 2);
  assert.match(String(topics[0].id), /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...topics[0], id: 'x' }, { id: 'x', title: 'Células', text: 'Encontre uma célula', callToAction: null, active: true });
  assert.deepEqual(topics[1], { id: TOPIC_ID, title: 'Batismo', text: 'Inscreva-se', callToAction: 'Fale com o pastor', active: false });
});

test('salvar sem topics mantém os tópicos guardados (painel antigo)', async () => {
  const { service, capture } = createService({ topics: STORED_TOPICS });
  await service.updateSettingsForTenant(TENANT, base, NOW);
  assert.equal('topics' in (capture.update as object), false);
});
