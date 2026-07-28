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
    tenant: {
      findMany: async () => [],
    },
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
    churchBranch: {
      findMany: async () => [],
    },
    pastor: {
      findMany: async () => [],
    },
    ministry: {
      findMany: async () => [],
    },
    churchConfig: {
      findUnique: async () => null,
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
    tagline: 'Minha família.',
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

test('listPublicForTenant mescla dados do banco nas secções', async () => {
  const prisma = createPrismaMock();
  prisma.churchBranch.findMany = async () => [
    {
      id: '1',
      tenantId: TENANT_A,
      name: 'Igreja Teste Sede',
      location: 'Santa Maria',
      address: 'Rua Principal',
      image: '/imagem.jpg',
      mapsUrl: 'https://maps.google.com',
      isHeadquarters: true,
      active: true,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  prisma.churchConfig.findUnique = async () => ({
    id: 'config-1',
    tenantId: TENANT_A,
    pixKey: 'pix-teste',
    bankName: 'Sicoob',
    bankCode: '756',
    agency: '3007',
    account: '1234',
    holderName: 'Favorecido',
    holderDocument: '00.000/0001-00',
    youtubeUrl: 'https://youtube.com',
    instagramUrl: 'https://instagram.com',
    facebookUrl: null,
    phone: '27 99999-9999',
    email: 'email@igreja.com',
    address: 'Endereço Completo',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const service = createService(prisma);
  const sections = await service.listPublicForTenant(TENANT_A);
  
  assert.deepEqual(sections.churches.items, [
    {
      name: 'Igreja Teste Sede',
      location: 'Santa Maria',
      address: 'Rua Principal',
      image: '/imagem.jpg',
      mapsUrl: 'https://maps.google.com',
      isHeadquarters: true,
      active: true,
    },
  ]);
  
  assert.equal(sections.giving.pixKey, 'pix-teste');
  assert.equal(sections.contact.phone, '27 99999-9999');
  assert.equal(sections.contact.youtubeUrl, 'https://youtube.com');
});

test('validação rejeita URL malformado', () => {
  const section = findSectionSpec('celulas')!;
  assert.throws(
    () => validateSectionValue(section, { ctaUrl: 'javascript:alert(1)' }),
    BadRequestException,
  );
});

test('validação aceita caminho relativo em campos de imagem', () => {
  const section = findSectionSpec('visit')!;
  const value = validateSectionValue(section, {
    backgroundImage: '/visit.jpg',
  });
  assert.equal(value.backgroundImage, '/visit.jpg');
});

test('PUT parcial não apaga os campos não enviados', () => {
  const section = findSectionSpec('contact')!;
  const value = validateSectionValue(section, { tagline: 'Nova Tagline' });
  assert.deepEqual(Object.keys(value), ['tagline']);
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

test('defaults cobrem todos os campos do spec de cada secção', () => {
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
