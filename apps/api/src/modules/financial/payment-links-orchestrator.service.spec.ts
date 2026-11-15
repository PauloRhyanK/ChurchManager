import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PaymentLinksOrchestratorService } from './payment-links-orchestrator.service';

function tenant(): Tenant {
  return {
    id: '00000000-0000-4000-8000-000000000111',
    name: 'Igreja Teste',
    slug: 'igreja-teste',
    asaasApiKey: 'encrypted',
    asaasWebhookToken: null,
    paymentSuccessRedirectUrl: null,
    paymentSuccessRedirectEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test('orchestrator: reutiliza link existente por reuseKey', async () => {
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => ({
        providerLinkId: 'link-existing',
        url: 'https://www.asaas.com/c/existing',
        sourceKey: 'cotas',
        active: true,
        isMonthly: true,
        subscriptionDurationMonths: 12,
      }),
      update: async () => {
        throw new Error('não deveria desactivar link válido');
      },
    },
    financialLinkPreset: {
      findUnique: async () => ({
        id: 'preset-id',
        sourceKey: 'cotas',
        isMonthly: true,
        subscriptionDurationMonths: 12,
        valueCents: null,
        successUrl: null,
        autoRedirect: null,
        active: true,
        name: 'Cotas 12x',
      }),
    },
  };
  const generation = {
    create: async () => {
      throw new Error('não deveria criar novo link');
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    presetKey: 'cotas_12x_site',
  });
  assert.equal(out.id, 'link-existing');
  assert.equal(out.metadata.reused, true);
});

test('orchestrator: cria e persiste link quando não encontra', async () => {
  let createdInDb = false;
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => null,
      create: async () => {
        createdInDb = true;
      },
    },
    financialLinkPreset: {
      findUnique: async () => ({
        id: 'preset-id',
        sourceKey: 'cotas',
        isMonthly: false,
        subscriptionDurationMonths: null,
        valueCents: 5000,
        successUrl: null,
        autoRedirect: null,
        active: true,
        name: 'Cota unica',
      }),
    },
  };
  const generation = {
    create: async () => ({
      id: 'link-new',
      url: 'https://www.asaas.com/c/new',
      metadata: { source: 'cotas', tenant: 'igreja-teste' },
    }),
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    presetKey: 'cotas_unica',
  });
  assert.equal(out.id, 'link-new');
  assert.equal(out.metadata.reused, false);
  assert.equal(createdInDb, true);
});

test('orchestrator: preset 1 mês normaliza para pagamento único ao criar', async () => {
  let persistPayload: { isMonthly: boolean; subscriptionDurationMonths: number | null };
  let generationOpts: { isMonthly: boolean; subscriptionDurationMonths?: number };
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => null,
      create: async (args: { data: typeof persistPayload }) => {
        persistPayload = args.data;
      },
    },
    financialLinkPreset: {
      findUnique: async () => ({
        id: 'preset-id',
        sourceKey: 'cotas',
        isMonthly: true,
        subscriptionDurationMonths: 1,
        valueCents: 5000,
        successUrl: null,
        autoRedirect: null,
        active: true,
        name: 'Cota 1 mês',
      }),
    },
  };
  const generation = {
    create: async (_tenant: unknown, opts: typeof generationOpts) => {
      generationOpts = opts;
      return {
        id: 'link-1m',
        url: 'https://www.asaas.com/c/1m',
        metadata: { source: 'cotas', tenant: 'igreja-teste' },
      };
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    presetKey: 'cotas_1x',
  });
  assert.equal(generationOpts!.isMonthly, false);
  assert.equal(generationOpts!.subscriptionDurationMonths, undefined);
  assert.equal(persistPayload!.isMonthly, false);
  assert.equal(persistPayload!.subscriptionDurationMonths, null);
});

test('orchestrator: não reutiliza link antigo RECURRENT 1 mês — gera novo DETACHED', async () => {
  let deactivated = false;
  let persistPayload: { isMonthly: boolean } | undefined;
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => ({
        id: 'old-row',
        providerLinkId: 'link-old-recurrent',
        url: 'https://www.asaas.com/c/old',
        sourceKey: 'cotas',
        active: true,
        isMonthly: true,
        subscriptionDurationMonths: 1,
      }),
      update: async (args: { data: { isMonthly?: boolean; active?: boolean } }) => {
        if (args.data.active === false) {
          deactivated = true;
          return;
        }
        // Mesmo reuseKey: a linha antiga é atualizada com o novo link (reuseKey é único).
        persistPayload = args.data as { isMonthly: boolean };
      },
      create: async () => {
        throw new Error('reuseKey já existe: deveria atualizar a linha, não criar');
      },
    },
    financialLinkPreset: {
      findUnique: async () => ({
        id: 'preset-id',
        sourceKey: 'cotas',
        isMonthly: true,
        subscriptionDurationMonths: 1,
        valueCents: 5000,
        successUrl: null,
        autoRedirect: null,
        active: true,
        name: 'Cota 1 mês',
      }),
    },
  };
  let generationOpts: { isMonthly: boolean; subscriptionDurationMonths?: number };
  const generation = {
    create: async (_t: unknown, opts: typeof generationOpts) => {
      generationOpts = opts;
      return {
        id: 'link-new-detached',
        url: 'https://www.asaas.com/c/new',
        metadata: { source: 'cotas', tenant: 'igreja-teste' },
      };
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    presetKey: 'cotas_1x',
  });
  assert.equal(deactivated, true);
  assert.equal(out.id, 'link-new-detached');
  assert.equal(out.metadata.reused, false);
  assert.equal(generationOpts!.isMonthly, false);
  assert.equal(persistPayload!.isMonthly, false);
});

// ---------------------------------------------------------------------------
// Cotas por pessoa: 409 HAS_ACTIVE_CONTRIBUTION e desativação dos outros links do CPF
// ---------------------------------------------------------------------------

const CPF = '52998224725';

function cpfCustomPrisma(opts: {
  activeSubscription: boolean;
  others?: Array<{ id: string; providerLinkId: string }>;
  existing?: Record<string, unknown> | null;
}) {
  const calls = {
    updateMany: [] as Array<{ where: { id: { in: string[] } }; data: unknown }>,
    created: [] as unknown[],
    updated: [] as unknown[],
    findManyWhere: undefined as unknown,
  };
  const prisma = {
    financialPayerProfile: {
      findUnique: async () => ({
        email: 'paulo@gmail.com',
        subscriptions: opts.activeSubscription ? [{ id: 'sub-1' }] : [],
      }),
    },
    financialPaymentLink: {
      findUnique: async () => opts.existing ?? null,
      create: async (args: { data: unknown }) => {
        calls.created.push(args.data);
      },
      update: async (args: { data: unknown }) => {
        calls.updated.push(args.data);
      },
      findMany: async (args: { where: unknown }) => {
        calls.findManyWhere = args.where;
        return opts.others ?? [];
      },
      updateMany: async (args: {
        where: { id: { in: string[] } };
        data: unknown;
      }) => {
        calls.updateMany.push(args);
        return { count: args.where.id.in.length };
      },
    },
  };
  return { prisma, calls };
}

function cpfInput(extra: Record<string, unknown> = {}) {
  return {
    reuseMode: 'cpf_custom' as const,
    cpf: CPF,
    name: 'Paulo Teste',
    isMonthly: true,
    subscriptionDurationMonths: 12,
    value: 100,
    ...extra,
  };
}

test('orchestrator cpf_custom: assinatura ativa sem confirmAdditional → 409 HAS_ACTIVE_CONTRIBUTION', async () => {
  const { prisma, calls } = cpfCustomPrisma({ activeSubscription: true });
  const generation = {
    create: async () => {
      throw new Error('não deveria gerar link');
    },
    remove: async () => {
      throw new Error('não deveria remover links');
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  await assert.rejects(
    () => service.createOrReusePublicCotasLink(tenant(), cpfInput()),
    (err: unknown) => {
      assert.ok(err instanceof ConflictException);
      assert.deepEqual(err.getResponse(), {
        code: 'HAS_ACTIVE_CONTRIBUTION',
        emailHint: 'pa***@gmail.com',
      });
      return true;
    },
  );
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updateMany.length, 0);
});

test('orchestrator cpf_custom: confirmAdditional false também → 409', async () => {
  const { prisma } = cpfCustomPrisma({ activeSubscription: true });
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    { create: async () => ({}) } as never,
  );
  await assert.rejects(
    () =>
      service.createOrReusePublicCotasLink(
        tenant(),
        cpfInput({ confirmAdditional: false }),
      ),
    ConflictException,
  );
});

test('orchestrator cpf_custom: assinatura ativa + confirmAdditional → gera link e desativa os outros do CPF', async () => {
  const { prisma, calls } = cpfCustomPrisma({
    activeSubscription: true,
    others: [
      { id: 'row-a', providerLinkId: 'link-a' },
      { id: 'row-b', providerLinkId: 'link-b' },
    ],
  });
  const removed: string[] = [];
  const generation = {
    create: async () => ({
      id: 'link-new',
      url: 'https://www.asaas.com/c/new',
      metadata: { source: 'cotas', tenant: 'igreja-teste' },
    }),
    remove: async (_t: unknown, linkId: string) => {
      removed.push(linkId);
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(
    tenant(),
    cpfInput({ confirmAdditional: true }),
  );
  assert.equal(out.id, 'link-new');
  assert.equal(calls.created.length, 1);
  assert.deepEqual(calls.findManyWhere, {
    tenantId: tenant().id,
    mode: 'CPF_CUSTOM',
    cpf: CPF,
    active: true,
    providerLinkId: { not: 'link-new' },
  });
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0]!.where.id.in, ['row-a', 'row-b']);
  assert.deepEqual(calls.updateMany[0]!.data, { active: false });
  assert.deepEqual(removed, ['link-a', 'link-b']);
});

test('orchestrator cpf_custom: falha no Asaas ao remover link antigo não derruba a resposta', async () => {
  const { prisma, calls } = cpfCustomPrisma({
    activeSubscription: false,
    others: [
      { id: 'row-a', providerLinkId: 'link-a' },
      { id: 'row-b', providerLinkId: 'link-b' },
    ],
  });
  const removed: string[] = [];
  const generation = {
    create: async () => ({
      id: 'link-new',
      url: 'https://www.asaas.com/c/new',
      metadata: { source: 'cotas', tenant: 'igreja-teste' },
    }),
    remove: async (_t: unknown, linkId: string) => {
      removed.push(linkId);
      if (linkId === 'link-a') throw new Error('Asaas fora');
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), cpfInput());
  assert.equal(out.id, 'link-new');
  assert.deepEqual(removed, ['link-a', 'link-b']);
  assert.deepEqual(calls.updateMany[0]!.where.id.in, ['row-a', 'row-b']);
});

test('orchestrator cpf_custom: reaproveita link igual ativo e ainda desativa os outros', async () => {
  const { prisma, calls } = cpfCustomPrisma({
    activeSubscription: false,
    existing: {
      id: 'row-same',
      providerLinkId: 'link-same',
      url: 'https://www.asaas.com/c/same',
      sourceKey: 'cotas',
      active: true,
      isMonthly: true,
      subscriptionDurationMonths: 12,
    },
    others: [{ id: 'row-old', providerLinkId: 'link-old' }],
  });
  const removed: string[] = [];
  const generation = {
    create: async () => {
      throw new Error('não deveria gerar link');
    },
    remove: async (_t: unknown, linkId: string) => {
      removed.push(linkId);
    },
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), cpfInput());
  assert.equal(out.id, 'link-same');
  assert.equal(out.metadata.reused, true);
  assert.deepEqual(
    (calls.findManyWhere as { providerLinkId: unknown }).providerLinkId,
    { not: 'link-same' },
  );
  assert.deepEqual(removed, ['link-old']);
});

test('orchestrator cpf_custom: link igual desativado → gera novo e atualiza a mesma linha (reuseKey único)', async () => {
  const { prisma, calls } = cpfCustomPrisma({
    activeSubscription: false,
    existing: {
      id: 'row-same',
      providerLinkId: 'link-dead',
      url: 'https://www.asaas.com/c/dead',
      sourceKey: 'cotas',
      active: false,
      isMonthly: true,
      subscriptionDurationMonths: 12,
    },
  });
  const generation = {
    create: async () => ({
      id: 'link-fresh',
      url: 'https://www.asaas.com/c/fresh',
      metadata: { source: 'cotas', tenant: 'igreja-teste' },
    }),
    remove: async () => undefined,
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), cpfInput());
  assert.equal(out.id, 'link-fresh');
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updated.length, 1);
  const data = calls.updated[0] as Record<string, unknown>;
  assert.equal(data.providerLinkId, 'link-fresh');
  assert.equal(data.active, true);
  assert.ok(data.createdAt instanceof Date);
  assert.equal('reuseKey' in data, false);
});

test('orchestrator preset_global: não consulta assinatura nem desativa links', async () => {
  const prisma = {
    financialPaymentLink: {
      findUnique: async () => null,
      create: async () => undefined,
      findMany: async () => {
        throw new Error('não deveria procurar links do CPF');
      },
    },
    financialPayerProfile: {
      findUnique: async () => {
        throw new Error('não deveria consultar perfil');
      },
    },
  };
  const generation = {
    create: async () => ({
      id: 'link-global',
      url: 'https://www.asaas.com/c/global',
      metadata: { source: 'cotas', tenant: 'igreja-teste' },
    }),
  };
  const service = new PaymentLinksOrchestratorService(
    prisma as never,
    generation as never,
  );
  const out = await service.createOrReusePublicCotasLink(tenant(), {
    reuseMode: 'preset_global',
    isMonthly: false,
    value: 50,
  });
  assert.equal(out.id, 'link-global');
});
