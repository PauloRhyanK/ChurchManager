import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import { CreateSermonDto, UpdateSermonDto } from './dto/sermon.dto';

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function parse<T>(metatype: Type<T>, body: unknown): Promise<T> {
  return (await pipe.transform(body, { type: 'body', metatype })) as T;
}
async function rejects(metatype: Type<unknown>, body: unknown) {
  await assert.rejects(parse(metatype, body), BadRequestException);
}

const SERVER_FIELDS = [
  { authorId: '11111111-1111-4111-8111-111111111111' },
  { tenantId: '22222222-2222-4222-8222-222222222222' },
  { status: 'SENT' },
  { revision: 3 },
  { baseReference: 'João 8:12' },
  { estimatedSeconds: 600 },
];

test('os DTOs recusam campos que o servidor devolve ou calcula', async () => {
  for (const extra of SERVER_FIELDS) {
    await rejects(CreateSermonDto, { title: 'Luz', ...extra });
    await rejects(UpdateSermonDto, { title: 'Luz', ...extra });
  }
});

test('título vazio, só espaços e de 256 caracteres são recusados; 255 passa e é aparado', async () => {
  for (const title of ['', '   ', 'x'.repeat(256), null, 3]) {
    await rejects(CreateSermonDto, { title });
    await rejects(UpdateSermonDto, { title });
  }
  assert.equal((await parse(CreateSermonDto, { title: ' Luz ' })).title, 'Luz');
  assert.equal((await parse(UpdateSermonDto, { title: 'x'.repeat(255) })).title?.length, 255);
});

test('criar sem título é permitido; atualizar aceita documento e baseRevision', async () => {
  assert.equal((await parse(CreateSermonDto, {})).title, undefined);
  const dto = await parse(UpdateSermonDto, { document: { type: 'doc', content: [] }, baseRevision: 0 });
  assert.equal(dto.baseRevision, 0);
  assert.deepEqual(dto.document, { type: 'doc', content: [] });
});

test('baseRevision e document têm tipo estrito', async () => {
  await rejects(UpdateSermonDto, { baseRevision: -1 });
  await rejects(UpdateSermonDto, { baseRevision: 1.5 });
  await rejects(UpdateSermonDto, { document: 'texto' });
});
