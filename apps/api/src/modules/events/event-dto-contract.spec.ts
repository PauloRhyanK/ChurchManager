import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function parse<T>(metatype: Type<T>, body: unknown): Promise<T> {
  return (await pipe.transform(body, { type: 'body', metatype })) as T;
}

async function messages(metatype: Type<unknown>, body: unknown) {
  try {
    await parse(metatype, body);
  } catch (err) {
    assert.ok(err instanceof BadRequestException);
    return (err.getResponse() as { message: string[] }).message;
  }
  return null;
}

test('UpdateEventDto aceita timeStart/timeEnd null (limpar horário)', async () => {
  const dto = await parse(UpdateEventDto, { timeStart: null, timeEnd: null });
  assert.equal(dto.timeStart, null);
  assert.equal(dto.timeEnd, null);
});

test('CreateEventDto aceita timeStart/timeEnd null', async () => {
  const dto = await parse(CreateEventDto, {
    title: 'Retiro',
    date: '2026-11-01',
    timeStart: null,
    timeEnd: null,
  });
  assert.equal(dto.timeStart, null);
  assert.equal(dto.timeEnd, null);
});

test('UpdateEventDto sem horário deixa os campos undefined (não altera)', async () => {
  const dto = await parse(UpdateEventDto, { title: 'Retiro' });
  assert.equal(dto.timeStart, undefined);
  assert.equal(dto.timeEnd, undefined);
});

test('horário em formato inválido continua rejeitado', async () => {
  assert.deepEqual(await messages(UpdateEventDto, { timeStart: '25:00' }), [
    'timeStart deve ser HH:MM ou HH:MM:SS',
  ]);
  assert.deepEqual(await messages(UpdateEventDto, { timeEnd: '' }), [
    'timeEnd deve ser HH:MM ou HH:MM:SS',
  ]);
});
