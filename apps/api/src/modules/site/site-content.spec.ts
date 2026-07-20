import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SITE_SECTIONS, findSectionSpec } from './site-content.registry';
import { SiteContentService } from './site-content.service';
import { validateSectionValue } from './site-content.validation';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const noopRevalidation = {
  notifyContentChanged: () => {},
};

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new SiteContentService(prisma as never, noopRevalidation as never);
}

interface StoredRow {
  key: string;
  value: unknown;
  updatedAt: Date;
}

function createPrismaMock(capture: { where?: unknown; data?: unknown } = {}) {
  return {
    siteContent: {
      findMany: async ({ where }: { where: unknown }): Promise<StoredRow[]> => {
        capture.where = where;
        return [];
      },
      findUnique: async ({
        where,
      }: {
        where: unknown;
      }): Promise<StoredRow | null> => {
        capture.where = where;
        return null;
      },
      upsert: async (args: { where: unknown; create: unknown }) => {
        capture.where = args.where;
        capture.data = args.create;
        return {
          value: (args.create as { value: unknown }).value,
          updatedAt: new Date('2026-07-18T12:00:00.000Z'),
        };
      },
      deleteMany: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return { count: 1 };
      },
    },
  };
}

test('isolation: listForTenant filtra por tenantId', async () => {
  const capture: { where?: unknown } = {};
  const service = createService(createPrismaMock(capture));
  await service.listForTenant(TENANT_A);
  assert.deepEqual(capture.where, { tenantId: TENANT_A });
});

test('isolation: updateForTenant grava com a chave composta do tenant', async () => {
  const capture: { where?: unknown; data?: unknown } = {};
  const service = createService(createPrismaMock(capture));
  await service.updateForTenant(TENANT_A, 'contact', {
    phone: '(27) 90000-0000',
  });
  assert.deepEqual(capture.where, {
    tenantId_key: { tenantId: TENANT_A, key: 'contact' },
  });
});

test('secção fora do registry devolve 404', async () => {
  const service = createService(createPrismaMock());
  await assert.rejects(
    () => service.updateForTenant(TENANT_A, 'nao-existe', {}),
    NotFoundException,
  );
});

test('secção nunca gravada devolve os defaults do registry', async () => {
  const service = createService(createPrismaMock());
  const section = await service.getForTenant(TENANT_A, 'mission');
  assert.equal(section.updatedAt, null);
  assert.equal(section.value.badge, 'Nossa Missão');
});

test('valor gravado é mesclado por cima dos defaults', async () => {
  const prisma = createPrismaMock();
  prisma.siteContent.findUnique = async () => ({
    key: 'mission',
    value: { badge: 'Editado' },
    updatedAt: new Date('2026-07-18T12:00:00.000Z'),
  });
  const service = createService(prisma);
  const section = await service.getForTenant(TENANT_A, 'mission');
  assert.equal(section.value.badge, 'Editado');
  // Campo não gravado continua a vir do default, em vez de ficar vazio.
  assert.equal(section.value.signature, 'Igreja Paraíso — Casa de Deus. Minha família.');
});

test('listPublicForTenant remove itens marcados como inativos', async () => {
  const prisma = createPrismaMock();
  prisma.siteContent.findMany = async () => [
    {
      key: 'ministries',
      value: {
        items: [
          { name: 'Visível', active: true },
          { name: 'Escondido', active: false },
        ],
      },
      updatedAt: new Date(),
    },
  ];
  const service = createService(prisma);
  const sections = await service.listPublicForTenant(TENANT_A);
  assert.deepEqual(sections.ministries.items, [{ name: 'Visível', active: true }]);
});

test('validação rejeita ícone fora da lista permitida', () => {
  const section = findSectionSpec('ministries')!;
  assert.throws(
    () =>
      validateSectionValue(section, {
        items: [{ name: 'Teste', icon: 'IconeInventado' }],
      }),
    BadRequestException,
  );
});

test('validação rejeita URL malformado', () => {
  const section = findSectionSpec('contact')!;
  assert.throws(
    () => validateSectionValue(section, { youtubeUrl: 'javascript:alert(1)' }),
    BadRequestException,
  );
});

test('validação aceita caminho relativo em campos de imagem', () => {
  const section = findSectionSpec('pastors')!;
  const value = validateSectionValue(section, {
    items: [{ name: 'Pr. Teste', image: '/prTeste.jpg' }],
  });
  assert.equal((value.items as Record<string, unknown>[])[0].image, '/prTeste.jpg');
});

test('PUT parcial não apaga os campos não enviados', () => {
  const section = findSectionSpec('contact')!;
  const value = validateSectionValue(section, { phone: '(27) 91234-5678' });
  // `copyright` fica de fora do objeto gravado, logo continua a vir do default.
  assert.deepEqual(Object.keys(value), ['phone']);
});

test('string vazia é gravada, para permitir limpar um campo de propósito', () => {
  const section = findSectionSpec('contact')!;
  const value = validateSectionValue(section, { copyright: '' });
  assert.equal(value.copyright, '');
  assert.ok('copyright' in value);
});

test('validação descarta propriedades fora do registry', () => {
  const section = findSectionSpec('youtube')!;
  const value = validateSectionValue(section, {
    channelHandle: 'paraisoigreja',
    sectionTitle: 'Ao vivo',
    campoIntruso: 'x',
  });
  assert.deepEqual(Object.keys(value).sort(), ['channelHandle', 'sectionTitle']);
});

test('validação exige campos obrigatórios dos itens de lista', () => {
  const section = findSectionSpec('churches')!;
  assert.throws(
    () => validateSectionValue(section, { items: [{ location: 'Sem nome' }] }),
    BadRequestException,
  );
});

test('validação exige endereço em igrejas visíveis no site', () => {
  const section = findSectionSpec('churches')!;
  assert.throws(
    () =>
      validateSectionValue(section, {
        items: [{ name: 'Filial Teste', active: true, address: '  ' }],
      }),
    BadRequestException,
  );
});

test('validação permite igreja oculta sem endereço', () => {
  const section = findSectionSpec('churches')!;
  const value = validateSectionValue(section, {
    items: [{ name: 'Rascunho', active: false, address: '' }],
  });
  assert.equal((value.items as Record<string, unknown>[])[0].name, 'Rascunho');
});

test('defaults cobrem todos os campos do spec de cada secção', () => {
  // O contrato público (docs/api/site-content-contract.md) garante que todos os
  // campos de uma secção existem sempre na resposta. Isso só se mantém enquanto
  // os defaults tiverem uma entrada por campo — a mesclagem não inventa chaves.
  for (const section of SITE_SECTIONS) {
    for (const field of section.fields) {
      assert.ok(
        field.name in section.defaults,
        `secção "${section.key}": falta default para o campo "${field.name}"`,
      );
    }
  }
});

test('todos os defaults do registry passam na própria validação', () => {
  for (const section of SITE_SECTIONS) {
    assert.doesNotThrow(
      () => validateSectionValue(section, section.defaults),
      `defaults inválidos na secção "${section.key}"`,
    );
  }
});
