import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Tenant } from '@prisma/client';
import {
  ContributorAccessService,
  hashContributorToken,
  resolveContributorJwtSecret,
} from './contributor-access.service';

const PANEL_SECRET = 'panel-secret-for-tests';
const CPF = '52998224725';
const ORIGINS = ['https://igrejaparaiso.com.br'];
const RETURN_URL = 'https://igrejaparaiso.com.br/api/cotas/acesso';

function tenant(id = '00000000-0000-4000-8000-000000000111'): Tenant {
  return {
    id,
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

const config = {
  get: (key: string) => (key === 'JWT_SECRET' ? PANEL_SECRET : undefined),
};

function makeService(prisma: unknown, mailer: unknown = { send: async () => {} }) {
  const jwt = new JwtService({
    secret: PANEL_SECRET,
    signOptions: { expiresIn: '7d' },
  });
  return {
    service: new ContributorAccessService(
      prisma as never,
      mailer as never,
      jwt,
      config as never,
    ),
    jwt,
  };
}

// --- access-link -----------------------------------------------------------

test('access-link: sem perfil → 202 sent sem criar token nem enviar e-mail', async () => {
  let sent = 0;
  const prisma = {
    financialPayerProfile: { findUnique: async () => null },
    financialContributorAccessToken: {
      create: async () => {
        throw new Error('não deveria criar token');
      },
    },
  };
  const { service } = makeService(prisma, { send: async () => void sent++ });
  const out = await service.requestAccessLink(
    tenant(),
    { cpf: CPF, returnUrl: RETURN_URL },
    ORIGINS,
  );
  assert.deepEqual(out, { sent: true });
  assert.equal(sent, 0);
});

test('access-link: perfil sem e-mail → 202 sent sem enviar', async () => {
  let sent = 0;
  const prisma = {
    financialPayerProfile: {
      findUnique: async () => ({ name: 'Fulano', email: '  ' }),
    },
    financialContributorAccessToken: {
      create: async () => {
        throw new Error('não deveria criar token');
      },
    },
  };
  const { service } = makeService(prisma, { send: async () => void sent++ });
  const out = await service.requestAccessLink(
    tenant(),
    { cpf: '529.982.247-25', returnUrl: RETURN_URL },
    ORIGINS,
  );
  assert.deepEqual(out, { sent: true });
  assert.equal(sent, 0);
});

test('access-link: perfil com e-mail → guarda só o hash (30 min) e envia returnUrl?token=', async () => {
  let stored: { tokenHash: string; cpf: string; tenantId: string; expiresAt: Date } | undefined;
  const mails: Array<{ to: string; html: string; text?: string }> = [];
  const prisma = {
    financialPayerProfile: {
      findUnique: async (args: { where: { tenantId_cpf: { cpf: string } } }) => {
        assert.equal(args.where.tenantId_cpf.cpf, CPF);
        return { name: 'Fulano de Tal', email: 'fulano@gmail.com' };
      },
    },
    financialContributorAccessToken: {
      create: async (args: { data: typeof stored }) => {
        stored = args.data;
      },
    },
  };
  const { service } = makeService(prisma, {
    send: async (m: { to: string; html: string; text?: string }) => {
      mails.push(m);
    },
  });
  const before = Date.now();
  const out = await service.requestAccessLink(
    tenant(),
    { cpf: CPF, returnUrl: RETURN_URL },
    ORIGINS,
  );
  assert.deepEqual(out, { sent: true });
  assert.equal(mails.length, 1);
  assert.equal(mails[0]!.to, 'fulano@gmail.com');
  const urlMatch = /(https:\/\/igrejaparaiso\.com\.br\/api\/cotas\/acesso\?token=[A-Za-z0-9_-]+)/.exec(
    mails[0]!.text ?? '',
  );
  assert.ok(urlMatch, 'e-mail deve conter returnUrl?token=');
  const raw = new URL(urlMatch[1]!).searchParams.get('token')!;
  assert.ok(stored);
  assert.equal(stored.cpf, CPF);
  assert.notEqual(stored.tokenHash, raw);
  assert.equal(stored.tokenHash, hashContributorToken(raw));
  const ttl = stored.expiresAt.getTime() - before;
  assert.ok(ttl > 29 * 60_000 && ttl <= 30 * 60_000 + 1000);
});

test('access-link: falha no envio de e-mail não muda a resposta', async () => {
  const prisma = {
    financialPayerProfile: {
      findUnique: async () => ({ name: 'Fulano', email: 'fulano@gmail.com' }),
    },
    financialContributorAccessToken: { create: async () => undefined },
  };
  const { service } = makeService(prisma, {
    send: async () => {
      throw new Error('Resend fora');
    },
  });
  const out = await service.requestAccessLink(
    tenant(),
    { cpf: CPF, returnUrl: RETURN_URL },
    ORIGINS,
  );
  assert.deepEqual(out, { sent: true });
});

test('access-link: returnUrl fora das origens públicas → 400', async () => {
  const { service } = makeService({});
  await assert.rejects(
    () =>
      service.requestAccessLink(
        tenant(),
        { cpf: CPF, returnUrl: 'https://evil.example.com/x' },
        ORIGINS,
      ),
    BadRequestException,
  );
});

// --- session ---------------------------------------------------------------

function tokenRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    tenantId: tenant().id,
    cpf: CPF,
    tokenHash: hashContributorToken('raw-token-123'),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    usedAt: null as Date | null,
    createdAt: new Date(),
    ...over,
  };
}

function assertInvalidToken(err: unknown) {
  assert.ok(err instanceof UnauthorizedException);
  assert.deepEqual(err.getResponse(), { code: 'INVALID_TOKEN' });
  return true;
}

test('session: token válido → marca usado e devolve JWT aud=contributor de 30 dias', async () => {
  let row = tokenRow();
  const prisma = {
    financialContributorAccessToken: {
      findUnique: async (args: { where: { tokenHash: string } }) =>
        args.where.tokenHash === row.tokenHash ? row : null,
      updateMany: async (args: { data: { usedAt: Date } }) => {
        if (row.usedAt) return { count: 0 };
        row = { ...row, usedAt: args.data.usedAt };
        return { count: 1 };
      },
    },
  };
  const { service, jwt } = makeService(prisma);
  const out = await service.createSession(tenant(), 'raw-token-123');
  assert.ok(row.usedAt);
  const expires = new Date(out.expiresAt).getTime();
  assert.ok(Math.abs(expires - (Date.now() + 30 * 86_400_000)) < 5000);

  const secret = resolveContributorJwtSecret({ jwtSecret: PANEL_SECRET });
  const payload = await jwt.verifyAsync(out.sessionToken, {
    secret,
    audience: 'contributor',
  });
  assert.equal(payload.tenantId, tenant().id);
  assert.equal(payload.cpf, CPF);
  assert.equal(payload.aud, 'contributor');
  assert.ok(Math.abs(payload.exp * 1000 - expires) < 5000);
  // Não valida com o segredo do painel.
  await assert.rejects(() => jwt.verifyAsync(out.sessionToken, { secret: PANEL_SECRET }));

  // Uso único: a segunda troca falha.
  await assert.rejects(
    () => service.createSession(tenant(), 'raw-token-123'),
    assertInvalidToken,
  );
});

test('session: token expirado → 401 INVALID_TOKEN', async () => {
  const prisma = {
    financialContributorAccessToken: {
      findUnique: async () => tokenRow({ expiresAt: new Date(Date.now() - 1000) }),
      updateMany: async () => {
        throw new Error('não deveria marcar');
      },
    },
  };
  const { service } = makeService(prisma);
  await assert.rejects(
    () => service.createSession(tenant(), 'raw-token-123'),
    assertInvalidToken,
  );
});

test('session: token de outro tenant, inexistente ou vazio → 401 INVALID_TOKEN', async () => {
  const prisma = {
    financialContributorAccessToken: {
      findUnique: async (args: { where: { tokenHash: string } }) =>
        args.where.tokenHash === hashContributorToken('raw-token-123')
          ? tokenRow({ tenantId: '00000000-0000-4000-8000-000000000999' })
          : null,
      updateMany: async () => ({ count: 1 }),
    },
  };
  const { service } = makeService(prisma);
  await assert.rejects(() => service.createSession(tenant(), 'raw-token-123'), assertInvalidToken);
  await assert.rejects(() => service.createSession(tenant(), 'nao-existe'), assertInvalidToken);
  await assert.rejects(() => service.createSession(tenant(), '   '), assertInvalidToken);
});

test('session: corrida — outro pedido marcou antes → 401', async () => {
  const prisma = {
    financialContributorAccessToken: {
      findUnique: async () => tokenRow(),
      updateMany: async () => ({ count: 0 }),
    },
  };
  const { service } = makeService(prisma);
  await assert.rejects(() => service.createSession(tenant(), 'raw-token-123'), assertInvalidToken);
});

// --- me --------------------------------------------------------------------

interface MeData {
  link?: Record<string, unknown> | null;
  confirmedAfterLink?: boolean;
}

function mePrisma(data: MeData = {}) {
  const linkCreatedAt = new Date('2026-11-10T12:00:00Z');
  return {
    financialPayerProfile: {
      findUnique: async () => ({
        id: 'payer-1',
        name: 'Fulano de Tal',
        email: 'fulano@gmail.com',
      }),
    },
    financialSubscription: {
      findMany: async () => [
        {
          id: 'sub-1',
          status: 'ACTIVE',
          createdAt: new Date('2026-10-01T10:00:00Z'),
          currentPeriodEnd: null,
          plan: { name: 'Plano base', amountCents: 999 },
          transactions: [
            {
              amountCents: 10000,
              rawPayloadRef: { paymentDescription: 'Cotas - Igreja Teste - Fulano' },
            },
          ],
        },
        {
          id: 'sub-2',
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01T10:00:00Z'),
          currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
          plan: { name: 'Plano base', amountCents: 5000 },
          transactions: [],
        },
      ],
    },
    financialTransaction: {
      findMany: async (args: { take: number; orderBy: unknown }) => {
        assert.equal(args.take, 12);
        assert.deepEqual(args.orderBy, { createdAt: 'desc' });
        return [
          {
            createdAt: new Date('2026-11-01T10:00:00Z'),
            amountCents: 10000,
            status: 'CONFIRMED',
            billingType: 'PIX',
          },
          {
            createdAt: new Date('2026-10-01T10:00:00Z'),
            amountCents: 10000,
            status: 'PENDING',
            billingType: null,
          },
        ];
      },
      findFirst: async (args: { where: { createdAt: { gt: Date }; status: string } }) => {
        assert.equal(args.where.status, 'CONFIRMED');
        assert.equal(args.where.createdAt.gt.getTime(), linkCreatedAt.getTime());
        return data.confirmedAfterLink ? { id: 'tx-after' } : null;
      },
    },
    financialPaymentLink: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        assert.equal(args.where.mode, 'CPF_CUSTOM');
        assert.equal(args.where.active, true);
        assert.equal(args.where.cpf, CPF);
        if (data.link === null) return null;
        return {
          url: 'https://www.asaas.com/c/pending',
          valueCents: 10000,
          isMonthly: true,
          subscriptionDurationMonths: 12,
          createdAt: linkCreatedAt,
          ...(data.link ?? {}),
        };
      },
    },
  };
}

/** Emite um JWT de contribuidor pelo fluxo real (token do e-mail → sessão). */
async function sessionFor(t = tenant()) {
  const prisma = {
    financialContributorAccessToken: {
      findUnique: async () => tokenRow({ tenantId: t.id }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const { service: issuer } = makeService(prisma);
  return (await issuer.createSession(t, 'raw-token-123')).sessionToken;
}

test('me: devolve payer, assinaturas, pagamentos e link pendente', async () => {
  const { service } = makeService(mePrisma());
  const token = await sessionFor();
  const out = await service.getMe(tenant(), `Bearer ${token}`);
  assert.deepEqual(out.payer, { name: 'Fulano de Tal', emailHint: 'fu***@gmail.com' });
  assert.deepEqual(out.subscriptions, [
    {
      id: 'sub-1',
      status: 'ACTIVE',
      valueCents: 10000,
      label: 'Cotas - Igreja Teste - Fulano',
      createdAt: '2026-10-01T10:00:00.000Z',
      currentPeriodEnd: null,
    },
    {
      id: 'sub-2',
      status: 'INACTIVE',
      valueCents: 5000,
      label: 'Plano base',
      createdAt: '2026-01-01T10:00:00.000Z',
      currentPeriodEnd: '2026-06-01T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(out.payments, [
    { date: '2026-11-01T10:00:00.000Z', valueCents: 10000, status: 'CONFIRMED', billingType: 'PIX' },
    { date: '2026-10-01T10:00:00.000Z', valueCents: 10000, status: 'PENDING', billingType: null },
  ]);
  assert.deepEqual(out.pendingLink, {
    url: 'https://www.asaas.com/c/pending',
    valueCents: 10000,
    isMonthly: true,
    subscriptionDurationMonths: 12,
    createdAt: '2026-11-10T12:00:00.000Z',
  });
});

test('me: pendingLink null quando há transação confirmada depois do link', async () => {
  const { service } = makeService(mePrisma({ confirmedAfterLink: true }));
  const token = await sessionFor();
  const out = await service.getMe(tenant(), `Bearer ${token}`);
  assert.equal(out.pendingLink, null);
});

test('me: pendingLink null sem link ativo', async () => {
  const { service } = makeService(mePrisma({ link: null }));
  const token = await sessionFor();
  const out = await service.getMe(tenant(), `Bearer ${token}`);
  assert.equal(out.pendingLink, null);
});

test('me: rejeita JWT de outro tenant', async () => {
  const { service } = makeService(mePrisma());
  const other = tenant('00000000-0000-4000-8000-000000000999');
  const token = await sessionFor(other);
  await assert.rejects(() => service.getMe(tenant(), `Bearer ${token}`), UnauthorizedException);
});

test('me: rejeita JWT do painel e JWT com outro aud', async () => {
  const { service, jwt } = makeService(mePrisma());
  const panel = await jwt.signAsync({ sub: 'user-1', tenantId: tenant().id, role: 'ADMIN' });
  await assert.rejects(() => service.getMe(tenant(), `Bearer ${panel}`), UnauthorizedException);

  const secret = resolveContributorJwtSecret({ jwtSecret: PANEL_SECRET });
  const otherAud = await jwt.signAsync(
    { tenantId: tenant().id, cpf: CPF },
    { secret, audience: 'panel' },
  );
  await assert.rejects(() => service.getMe(tenant(), `Bearer ${otherAud}`), UnauthorizedException);

  const noAud = await jwt.signAsync({ tenantId: tenant().id, cpf: CPF }, { secret });
  await assert.rejects(() => service.getMe(tenant(), `Bearer ${noAud}`), UnauthorizedException);
});

test('me: sem header Authorization ou expirado → 401', async () => {
  const { service, jwt } = makeService(mePrisma());
  await assert.rejects(() => service.getMe(tenant(), undefined), UnauthorizedException);
  await assert.rejects(() => service.getMe(tenant(), 'Basic abc'), UnauthorizedException);
  const secret = resolveContributorJwtSecret({ jwtSecret: PANEL_SECRET });
  const expired = await jwt.signAsync(
    { tenantId: tenant().id, cpf: CPF },
    { secret, audience: 'contributor', expiresIn: -10 },
  );
  await assert.rejects(() => service.getMe(tenant(), `Bearer ${expired}`), UnauthorizedException);
});

test('resolveContributorJwtSecret: usa CONTRIBUTOR_JWT_SECRET ou deriva, nunca igual ao do painel', () => {
  assert.equal(
    resolveContributorJwtSecret({ contributorSecret: 'own', jwtSecret: PANEL_SECRET }),
    'own',
  );
  const derived = resolveContributorJwtSecret({ jwtSecret: PANEL_SECRET });
  assert.notEqual(derived, PANEL_SECRET);
  assert.equal(derived.length, 64);
  assert.throws(() => resolveContributorJwtSecret({}));
});
