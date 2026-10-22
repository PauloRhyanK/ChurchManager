import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../validation-options';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreatePastorDto } from './dto/create-pastor.dto';
import { UpdatePastorDto } from './dto/update-pastor.dto';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { UpdateChurchConfigDto } from './dto/update-church-config.dto';
import { CreateScheduleDto } from '../events/dto/create-schedule.dto';
import { UpdateScheduleDto } from '../events/dto/update-schedule.dto';

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function parse<T>(metatype: Type<T>, body: unknown): Promise<T> {
  return (await pipe.transform(body, { type: 'body', metatype })) as T;
}

async function messages(metatype: Type<unknown>, body: unknown) {
  try {
    await parse(metatype, body);
  } catch (err) {
    assert.ok(err instanceof BadRequestException);
    const res = err.getResponse() as { message: string[] };
    return res.message;
  }
  return null;
}

const SERVER_FIELDS = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const BRANCH_BODY = {
  name: 'Sede',
  location: 'Centro',
  address: 'Rua A, 1',
  image: 'https://cdn.exemplo.com/a.png',
  mapsUrl: 'https://maps.google.com/?q=1',
  isHeadquarters: true,
  active: true,
  sortOrder: 1,
};
const PASTOR_BODY = {
  name: 'Pr. João',
  image: 'https://cdn.exemplo.com/p.png',
  active: true,
  sortOrder: 0,
};
const MINISTRY_BODY = {
  name: 'Louvor',
  description: 'Música',
  icon: 'music',
  image: 'https://cdn.exemplo.com/m.png',
  active: true,
  sortOrder: 2,
};
const SCHEDULE_BODY = {
  title: 'Culto',
  dayOfWeek: 'Domingo',
  timeStart: '19:00',
  location: 'Templo',
  description: 'Culto da família',
  active: true,
  sortOrder: 0,
};
const CONFIG_BODY = {
  youtubeUrl: 'https://youtube.com/@igreja',
  instagramUrl: 'https://instagram.com/igreja',
  facebookUrl: null,
  phone: '1199999',
};

const CASES: Array<[string, Type<unknown>, Record<string, unknown>]> = [
  ['CreateBranchDto', CreateBranchDto, BRANCH_BODY],
  ['UpdateBranchDto', UpdateBranchDto, BRANCH_BODY],
  ['CreatePastorDto', CreatePastorDto, PASTOR_BODY],
  ['UpdatePastorDto', UpdatePastorDto, PASTOR_BODY],
  ['CreateMinistryDto', CreateMinistryDto, MINISTRY_BODY],
  ['UpdateMinistryDto', UpdateMinistryDto, MINISTRY_BODY],
  ['CreateScheduleDto', CreateScheduleDto, SCHEDULE_BODY],
  ['UpdateScheduleDto', UpdateScheduleDto, SCHEDULE_BODY],
  ['UpdateChurchConfigDto', UpdateChurchConfigDto, CONFIG_BODY],
];

for (const [name, Dto, body] of CASES) {
  test(`${name}: corpo do painel é aceito`, async () => {
    assert.equal(await messages(Dto, body), null);
  });

  test(`${name}: id/tenantId/createdAt/updatedAt são recusados`, async () => {
    const msgs = await messages(Dto, { ...body, ...SERVER_FIELDS });
    assert.ok(msgs, 'deveria responder 400');
    for (const f of Object.keys(SERVER_FIELDS)) {
      assert.ok(
        msgs.includes(`property ${f} should not exist`),
        `faltou recusa de ${f}: ${msgs.join(' | ')}`,
      );
    }
  });
}

test("booleano: 'false' em texto não vira true", async () => {
  for (const Dto of [UpdateBranchDto, UpdatePastorDto, UpdateMinistryDto, UpdateScheduleDto]) {
    const out = (await parse(Dto as Type<{ active?: boolean }>, { active: 'false' })) as {
      active?: boolean;
    };
    assert.equal(out.active, false, Dto.name);
  }
  const branch = await parse(CreateBranchDto, { name: 'x', isHeadquarters: 'false' });
  assert.equal(branch.isHeadquarters, false);
});

test('booleano: false real permanece false e valor inválido é recusado', async () => {
  const out = await parse(UpdateBranchDto, { active: false, isHeadquarters: false });
  assert.equal(out.active, false);
  assert.equal(out.isHeadquarters, false);
  assert.ok(await messages(UpdateBranchDto, { active: 'talvez' }));
});

test('nome obrigatório: null, vazio e só espaços são recusados', async () => {
  for (const Dto of [
    CreateBranchDto,
    UpdateBranchDto,
    CreatePastorDto,
    UpdatePastorDto,
    CreateMinistryDto,
    UpdateMinistryDto,
  ]) {
    for (const name of [null, '', '   ']) {
      assert.ok(await messages(Dto, { name }), `${Dto.name} name=${JSON.stringify(name)}`);
    }
  }
  for (const Dto of [CreateScheduleDto, UpdateScheduleDto]) {
    for (const title of [null, '', '   ']) {
      assert.ok(
        await messages(Dto, { ...SCHEDULE_BODY, title }),
        `${Dto.name} title=${JSON.stringify(title)}`,
      );
    }
  }
});

test('nome é aparado e atualização parcial sem nome continua válida', async () => {
  assert.equal((await parse(UpdateBranchDto, { name: '  Sede  ' })).name, 'Sede');
  assert.equal(await messages(UpdateBranchDto, { active: false }), null);
});

const URL_FIELDS: Array<[string, Type<unknown>, string]> = [
  ['CreateBranchDto', CreateBranchDto, 'mapsUrl'],
  ['UpdateBranchDto', UpdateBranchDto, 'mapsUrl'],
  ['CreateBranchDto', CreateBranchDto, 'image'],
  ['UpdateBranchDto', UpdateBranchDto, 'image'],
  ['CreatePastorDto', CreatePastorDto, 'image'],
  ['UpdatePastorDto', UpdatePastorDto, 'image'],
  ['CreateMinistryDto', CreateMinistryDto, 'image'],
  ['UpdateMinistryDto', UpdateMinistryDto, 'image'],
  ['UpdateChurchConfigDto', UpdateChurchConfigDto, 'youtubeUrl'],
  ['UpdateChurchConfigDto', UpdateChurchConfigDto, 'instagramUrl'],
  ['UpdateChurchConfigDto', UpdateChurchConfigDto, 'facebookUrl'],
];

for (const [name, Dto, field] of URL_FIELDS) {
  const base = Dto === UpdateChurchConfigDto ? {} : { name: 'x' };
  test(`${name}.${field}: só http/https`, async () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.com/x', 'sem-protocolo.com', '//a.com/x']) {
      const msgs = await messages(Dto, { ...base, [field]: bad });
      assert.ok(msgs, `${bad} deveria ser recusada`);
      assert.ok(
        msgs.some((m) => m.includes('http')),
        `mensagem em pt-BR esperada: ${msgs.join(' | ')}`,
      );
    }
    for (const ok of ['https://a.com/x.png', 'http://a.com/x', null, '', '   ']) {
      assert.equal(await messages(Dto, { ...base, [field]: ok }), null, String(ok));
    }
  });
}

test('URL vazia vira null', async () => {
  assert.equal((await parse(UpdateBranchDto, { mapsUrl: '  ' })).mapsUrl, null);
});
