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
      findMany: async (_args?: unknown) => [] as any[],
    },
    pastor: {
      findMany: async (_args?: unknown) => [] as any[],
    },
    ministry: {
      findMany: async (_args?: unknown) => [] as any[],
    },
    churchConfig: {
      findUnique: async () => null as any,
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

// ---------------------------------------------------------------------------
// Migração legada: aditiva, idempotente, uma transação por tenant.
// ---------------------------------------------------------------------------

interface LegacyDb {
  siteContent: Array<{ id: string; tenantId: string; key: string; value: unknown }>;
  churchBranch: Array<Record<string, unknown>>;
  pastor: Array<Record<string, unknown>>;
  ministry: Array<Record<string, unknown>>;
  churchConfig: Array<Record<string, unknown>>;
}

function createLegacyPrisma(db: LegacyDb, opts: { failOn?: string } = {}) {
  const forTenant = (rows: Array<Record<string, unknown>>) => ({
    count: async ({ where }: { where: { tenantId: string } }) =>
      rows.filter((r) => r.tenantId === where.tenantId).length,
    createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
      if (opts.failOn && data.some((d) => d.tenantId === opts.failOn)) {
        throw new Error('falha simulada');
      }
      rows.push(...data);
      return { count: data.length };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      rows.push(data);
      return data;
    },
  });
  const tx = {
    siteContent: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        db.siteContent.filter((r) => r.tenantId === where.tenantId),
      update: async () => {
        throw new Error('migração não pode atualizar site_content');
      },
      delete: async () => {
        throw new Error('migração não pode apagar site_content');
      },
      deleteMany: async () => {
        throw new Error('migração não pode apagar site_content');
      },
    },
    churchBranch: forTenant(db.churchBranch),
    pastor: forTenant(db.pastor),
    ministry: forTenant(db.ministry),
    churchConfig: forTenant(db.churchConfig),
  };
  return {
    ...tx,
    tenant: { findMany: async () => [{ id: TENANT_A }, { id: TENANT_B }] },
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
      // Simula rollback: operações da transação só persistem se fn terminar.
      const snapshot = JSON.stringify(db);
      try {
        return await fn(tx);
      } catch (err) {
        const restored = JSON.parse(snapshot) as LegacyDb;
        (Object.keys(restored) as Array<keyof LegacyDb>).forEach((k) => {
          db[k].splice(0, db[k].length, ...(restored[k] as never[]));
        });
        throw err;
      }
    },
  };
}

const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function legacyDb(): LegacyDb {
  return {
    siteContent: [
      {
        id: 'c1',
        tenantId: TENANT_A,
        key: 'churches',
        value: { badge: 'X', items: [{ name: 'Sede', isHeadquarters: true }] },
      },
      { id: 'm1', tenantId: TENANT_A, key: 'ministries', value: { items: [{ name: 'Louvor' }] } },
      { id: 'g1', tenantId: TENANT_A, key: 'giving', value: { pixKey: 'pix-antigo', intro: 'oi' } },
      { id: 'k1', tenantId: TENANT_A, key: 'contact', value: { phone: '111', tagline: 't' } },
    ],
    churchBranch: [],
    pastor: [],
    ministry: [],
    churchConfig: [],
  };
}

async function boot(db: LegacyDb, opts: { failOn?: string } = {}) {
  const service = new SiteContentService(
    createLegacyPrisma(db, opts) as never,
    noopRevalidation as never,
  );
  await service.onModuleInit();
}

test('migração legada: copia para as tabelas vazias e nunca altera site_content', async () => {
  const db = legacyDb();
  const before = JSON.stringify(db.siteContent);
  await boot(db);
  assert.equal(db.churchBranch.length, 1);
  assert.equal(db.ministry.length, 1);
  assert.equal(db.churchConfig.length, 1);
  assert.equal(db.churchConfig[0].pixKey, 'pix-antigo');
  assert.equal(JSON.stringify(db.siteContent), before);
});

test('migração legada: rodar duas vezes não muda nada', async () => {
  const db = legacyDb();
  await boot(db);
  const after1 = JSON.stringify(db);
  await boot(db);
  assert.equal(JSON.stringify(db), after1);
});

test('migração legada: tabela com dados não é tocada e nada é apagado', async () => {
  const db = legacyDb();
  db.churchBranch.push({ tenantId: TENANT_A, name: 'Já existe' });
  db.ministry.push({ tenantId: TENANT_A, name: 'Já existe' });
  db.churchConfig.push({ tenantId: TENANT_A, pixKey: null });
  const before = JSON.stringify(db);
  await boot(db);
  assert.equal(JSON.stringify(db), before);
});

test('migração legada: falha num tenant faz rollback dele e não impede os outros', async () => {
  const db = legacyDb();
  db.siteContent.push({
    id: 'c2',
    tenantId: TENANT_B,
    key: 'churches',
    value: { items: [{ name: 'Filial B' }] },
  });
  // TENANT_A falha ao gravar ministérios (já gravou filiais na mesma transação).
  const prisma = createLegacyPrisma(db);
  const originalCreateMany = prisma.ministry.createMany;
  prisma.ministry.createMany = async (args) => {
    if (args.data.some((d) => d.tenantId === TENANT_A)) throw new Error('boom');
    return originalCreateMany(args);
  };
  const service = new SiteContentService(prisma as never, noopRevalidation as never);
  await service.onModuleInit();
  assert.deepEqual(
    db.churchBranch.map((b) => b.tenantId),
    [TENANT_B],
  );
  assert.equal(db.ministry.length, 0);
  assert.equal(db.churchConfig.length, 0);
});

// ---------------------------------------------------------------------------
// Contrato público: GET /api/public/tenants/:slug/site-content
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS = ['id', 'tenantId', 'createdAt', 'updatedAt', 'sortOrder'];

function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

const now = new Date();
function row(extra: Record<string, unknown>) {
  return { id: 'x', tenantId: TENANT_A, sortOrder: 0, createdAt: now, updatedAt: now, ...extra };
}

function contractPrisma() {
  const prisma = createPrismaMock();
  // O mock devolve linhas já filtradas por `active` e ordenadas como o Prisma faria;
  // aqui capturamos os argumentos para provar que o serviço pede isso ao banco.
  const calls: Record<string, any> = {};
  prisma.churchBranch.findMany = async (args: any) => {
    calls.branch = args;
    return [
      row({ name: 'Sede', location: 'SMJ', address: 'Rua 1', image: null, mapsUrl: null, isHeadquarters: true, active: true }),
    ];
  };
  prisma.pastor.findMany = async (args: any) => {
    calls.pastor = args;
    return [row({ name: 'Pr. A', image: '/a.jpg', active: true, role: 'interno' })];
  };
  prisma.ministry.findMany = async (args: any) => {
    calls.ministry = args;
    return [row({ name: 'Louvor', description: null, icon: 'Music', image: null, active: true })];
  };
  prisma.churchConfig.findUnique = async () =>
    ({
      id: 'cfg',
      tenantId: TENANT_A,
      pixKey: 'pix',
      bankName: 'Banco',
      bankCode: '001',
      agency: '1',
      account: '2',
      holderName: 'Fav',
      holderDocument: '0',
      phone: '1',
      email: 'a@b.c',
      address: 'End',
      youtubeUrl: 'y',
      instagramUrl: 'i',
      facebookUrl: 'f',
      createdAt: now,
      updatedAt: now,
    }) as any;
  return { prisma, calls };
}

test('contrato público: formato exato de cada seção', async () => {
  const { prisma } = contractPrisma();
  const sections = await createService(prisma).listPublicForTenant(TENANT_A);

  assert.deepEqual(Object.keys(sections).sort(), [
    'celulas', 'churches', 'contact', 'giving', 'ministries',
    'mission', 'pastors', 'visit', 'youtube',
  ]);
  assert.deepEqual(Object.keys(sections.mission), Object.keys(findSectionSpec('mission')!.defaults));
  assert.deepEqual(Object.keys(sections.celulas), Object.keys(findSectionSpec('celulas')!.defaults));
  assert.deepEqual(Object.keys(sections.visit), Object.keys(findSectionSpec('visit')!.defaults));
  assert.deepEqual(Object.keys(sections.youtube), ['channelHandle', 'sectionTitle']);
  assert.deepEqual(Object.keys(sections.churches), ['badge', 'titlePart1', 'titleHighlight', 'intro', 'items']);
  assert.deepEqual(Object.keys(sections.pastors), ['badge', 'titlePart1', 'titleHighlight', 'intro', 'items']);
  assert.deepEqual(Object.keys(sections.ministries), ['items']);
  assert.deepEqual(Object.keys(sections.giving), [
    'badge', 'titlePart1', 'titleHighlight', 'titlePart2', 'intro',
    'pixKey', 'bankName', 'bankCode', 'agency', 'account', 'holderName', 'holderDocument',
  ]);
  assert.deepEqual(Object.keys(sections.contact), [
    'tagline', 'copyright', 'phone', 'email', 'address', 'youtubeUrl', 'instagramUrl', 'facebookUrl',
  ]);
  assert.deepEqual(sections.churches.items, [
    { name: 'Sede', location: 'SMJ', address: 'Rua 1', image: '', mapsUrl: '', isHeadquarters: true, active: true },
  ]);
  assert.deepEqual(sections.pastors.items, [{ name: 'Pr. A', image: '/a.jpg', active: true }]);
  assert.deepEqual(sections.ministries.items, [
    { name: 'Louvor', description: '', icon: 'Music', image: '', active: true },
  ]);
});

test('contrato público: não vaza id/tenantId/timestamps/sortOrder', async () => {
  const { prisma } = contractPrisma();
  const sections = await createService(prisma).listPublicForTenant(TENANT_A);
  const keys = collectKeys(sections);
  for (const forbidden of FORBIDDEN_KEYS) {
    assert.equal(keys.has(forbidden), false, `vazou "${forbidden}"`);
  }
  assert.equal(keys.has('role'), false);
});

test('contrato público: só itens ativos, ordenados por sortOrder (sede primeiro nas filiais)', async () => {
  const { prisma, calls } = contractPrisma();
  await createService(prisma).listPublicForTenant(TENANT_A);
  assert.deepEqual(calls.branch.where, { tenantId: TENANT_A, active: true });
  assert.deepEqual(calls.branch.orderBy, [
    { isHeadquarters: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' },
  ]);
  for (const k of ['pastor', 'ministry']) {
    assert.deepEqual(calls[k].where, { tenantId: TENANT_A, active: true });
    assert.deepEqual(calls[k].orderBy, [{ sortOrder: 'asc' }, { name: 'asc' }]);
  }
});

test('contrato público: listas do JSON legado com active:false não aparecem', async () => {
  const prisma = createPrismaMock();
  prisma.siteContent.findMany = async () => [
    {
      key: 'celulas',
      value: { benefits: [{ titulo: 'A', active: false }, { titulo: 'B' }] },
      updatedAt: now,
    },
  ];
  const sections = await createService(prisma).listPublicForTenant(TENANT_A);
  assert.deepEqual(sections.celulas.benefits, [{ titulo: 'B' }]);
});

test('fonte oficial: campo limpo (null) no ChurchConfig não ressuscita o valor do JSON legado', async () => {
  const prisma = createPrismaMock();
  prisma.siteContent.findMany = async () => [
    { key: 'contact', value: { phone: 'LEGADO', email: 'legado@x', address: 'LEGADO' }, updatedAt: now },
    { key: 'giving', value: { pixKey: 'LEGADO', bankName: 'LEGADO' }, updatedAt: now },
  ];
  prisma.churchConfig.findUnique = async () =>
    ({
      pixKey: null, bankName: null, bankCode: null, agency: null, account: null,
      holderName: null, holderDocument: null,
      phone: null, email: null, address: null,
      youtubeUrl: null, instagramUrl: null, facebookUrl: null,
    }) as any;
  const sections = await createService(prisma).listPublicForTenant(TENANT_A);
  for (const f of ['phone', 'email', 'address', 'youtubeUrl', 'instagramUrl', 'facebookUrl']) {
    assert.equal(sections.contact[f], '', `contact.${f}`);
  }
  for (const f of ['pixKey', 'bankName', 'bankCode', 'agency', 'account', 'holderName', 'holderDocument']) {
    assert.equal(sections.giving[f], '', `giving.${f}`);
  }
});

test('fonte oficial: contact.* e giving.* vêm do ChurchConfig, não do JSON', async () => {
  const { prisma } = contractPrisma();
  prisma.siteContent.findMany = async () => [
    { key: 'contact', value: { phone: 'LEGADO' }, updatedAt: now },
  ];
  const sections = await createService(prisma).listPublicForTenant(TENANT_A);
  assert.equal(sections.contact.phone, '1');
  assert.equal(sections.giving.pixKey, 'pix');
});

// ---------------------------------------------------------------------------
// Gestão do Site: PUT/DELETE persistem e o GET seguinte devolve o salvo.
// ---------------------------------------------------------------------------

test('PUT persiste e o GET seguinte devolve o valor salvo; DELETE volta ao inicial', async () => {
  const store = new Map<string, { value: unknown; updatedAt: Date }>();
  const prisma = createPrismaMock();
  const k = (w: { tenantId_key: { tenantId: string; key: string } }) =>
    `${w.tenantId_key.tenantId}:${w.tenantId_key.key}`;
  (prisma.siteContent as any).upsert = async (a: any) => {
    const r = { value: a.create.value, updatedAt: new Date() };
    store.set(k(a.where), r);
    return r;
  };
  (prisma.siteContent as any).findUnique = async ({ where }: any) => store.get(k(where)) ?? null;
  (prisma.siteContent as any).deleteMany = async ({ where }: any) => {
    store.delete(`${where.tenantId}:${where.key}`);
    return { count: 1 };
  };
  const service = createService(prisma);

  await service.updateForTenant(TENANT_A, 'mission', { badge: 'Salvo' });
  assert.equal((await service.getForTenant(TENANT_A, 'mission')).value.badge, 'Salvo');

  await service.resetForTenant(TENANT_A, 'mission');
  const reset = await service.getForTenant(TENANT_A, 'mission');
  assert.equal(reset.value.badge, 'Nossa Missão');
  assert.equal(reset.updatedAt, null);
});
