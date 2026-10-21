import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import { PasswordResetService } from './password-reset.service';

const config = {
  get: (key: string) =>
    key === 'ADMIN_WEB_BASE_URL' ? 'https://painel.exemplo' : undefined,
};

const activeMember = {
  id: 'u2',
  email: 'membro@exemplo.com',
  name: 'Membro',
  role: AdminUserRole.TENANT_MEMBER,
  status: AdminUserStatus.ACTIVE,
  passwordHash: 'hash',
};

function makeDeps(user: unknown, opts: { mailFails?: boolean } = {}) {
  const calls = {
    findFirstWhere: undefined as unknown,
    invalidated: [] as unknown[],
    created: [] as { expiresAt: Date; token: string }[],
    sent: [] as { subject: string; text?: string }[],
  };
  const tx = {
    adminPasswordReset: {
      updateMany: async (args: unknown) => {
        calls.invalidated.push(args);
        return { count: 1 };
      },
      create: async ({ data }: { data: { expiresAt: Date; token: string } }) => {
        calls.created.push(data);
        return data;
      },
    },
  };
  const prisma = {
    adminUser: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.findFirstWhere = where;
        return user;
      },
      findUnique: async () => user,
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const mailer = {
    send: async (msg: { subject: string; text?: string }) => {
      if (opts.mailFails) throw new Error('smtp down');
      calls.sent.push(msg);
    },
  };
  const service = new PasswordResetService(
    prisma as never,
    config as never,
    mailer as never,
  );
  return { service, calls };
}

test('issueForUser filtra pelo tenant e devolve NotFound fora dele', async () => {
  const { service, calls } = makeDeps(null);
  await assert.rejects(
    () => service.issueForUser('t1', 'u2', 'u1'),
    (err: unknown) => err instanceof NotFoundException,
  );
  assert.deepEqual(calls.findFirstWhere, { id: 'u2', tenantId: 't1' });
});

test('issueForUser não permite resetar a própria conta', async () => {
  const { service } = makeDeps(activeMember);
  await assert.rejects(
    () => service.issueForUser('t1', 'u1', 'u1'),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('issueForUser não permite resetar administradores', async () => {
  for (const role of [AdminUserRole.TENANT_ADMIN, AdminUserRole.PLATFORM_ADMIN]) {
    const { service, calls } = makeDeps({ ...activeMember, role });
    await assert.rejects(
      () => service.issueForUser('t1', 'u2', 'u1'),
      (err: unknown) => err instanceof BadRequestException,
    );
    assert.equal(calls.created.length, 0);
  }
});

test('issueForUser exige utilizador ativo com senha', async () => {
  for (const over of [
    { status: AdminUserStatus.SUSPENDED },
    { status: AdminUserStatus.INVITED, passwordHash: null },
  ]) {
    const { service } = makeDeps({ ...activeMember, ...over });
    await assert.rejects(
      () => service.issueForUser('t1', 'u2', 'u1'),
      (err: unknown) => err instanceof BadRequestException,
    );
  }
});

test('issueForUser invalida pedidos antigos, cria link de 24h e envia e-mail', async () => {
  const { service, calls } = makeDeps(activeMember);
  const before = Date.now();
  const result = await service.issueForUser('t1', 'u2', 'u1');

  assert.equal(calls.invalidated.length, 1);
  assert.equal(calls.created.length, 1);
  const token = calls.created[0].token;
  assert.equal(result.url, `https://painel.exemplo/recuperar-senha/${token}`);
  const ttl = result.expiresAt.getTime() - before;
  assert.ok(ttl > 23.9 * 3600_000 && ttl <= 24 * 3600_000 + 1000);
  assert.equal(result.emailSent, true);
  assert.equal(calls.sent.length, 1);
  assert.match(calls.sent[0].text!, /24 horas/);
  assert.match(calls.sent[0].text!, /administrador/);
});

test('issueForUser devolve o link mesmo quando o e-mail falha', async () => {
  const { service } = makeDeps(activeMember, { mailFails: true });
  const result = await service.issueForUser('t1', 'u2', 'u1');
  assert.equal(result.emailSent, false);
  assert.match(result.url, /\/recuperar-senha\//);
});

test('requestReset continua genérico e com validade de 1 hora', async () => {
  const { service, calls } = makeDeps(activeMember);
  const before = Date.now();
  assert.deepEqual(await service.requestReset('Membro@Exemplo.com'), { ok: true });
  const ttl = calls.created[0].expiresAt.getTime() - before;
  assert.ok(ttl > 59 * 60_000 && ttl <= 60 * 60_000 + 1000);
  assert.match(calls.sent[0].text!, /1 hora/);
});
