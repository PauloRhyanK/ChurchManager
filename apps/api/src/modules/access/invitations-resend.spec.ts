import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminUserStatus } from '@prisma/client';
import { InvitationsService } from './invitations.service';

const config = {
  get: (key: string) =>
    key === 'ADMIN_WEB_BASE_URL' ? 'https://painel.exemplo' : undefined,
};

function makeDeps(opts: {
  user?: unknown;
  invitation?: unknown;
  mailFails?: boolean;
}) {
  const calls = {
    userWhere: undefined as unknown,
    updates: [] as { where: unknown; data: Record<string, unknown> }[],
    sent: 0,
  };
  const prisma = {
    adminUser: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.userWhere = where;
        return opts.user ?? null;
      },
    },
    adminUserInvitation: {
      findFirst: async () => opts.invitation ?? null,
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        calls.updates.push(args);
        return {
          id: 'inv1',
          email: 'convidado@exemplo.com',
          groupIds: ['g1'],
          ...args.data,
        };
      },
    },
    tenant: { findUnique: async () => ({ name: 'Igreja Exemplo' }) },
  };
  const mailer = {
    send: async () => {
      if (opts.mailFails) throw new Error('smtp down');
      calls.sent += 1;
    },
  };
  const service = new InvitationsService(
    prisma as never,
    config as never,
    {} as never,
    mailer as never,
  );
  return { service, calls };
}

const invitedUser = { id: 'u2', name: null, status: AdminUserStatus.INVITED };

test('resendInvite filtra pelo tenant', async () => {
  const { service, calls } = makeDeps({});
  await assert.rejects(
    () => service.resendInvite('t1', 'u2'),
    (err: unknown) => err instanceof NotFoundException,
  );
  assert.deepEqual(calls.userWhere, { id: 'u2', tenantId: 't1' });
});

test('resendInvite exige utilizador INVITED', async () => {
  const { service } = makeDeps({
    user: { ...invitedUser, status: AdminUserStatus.ACTIVE },
    invitation: { id: 'inv1' },
  });
  await assert.rejects(
    () => service.resendInvite('t1', 'u2'),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('resendInvite exige convite pendente', async () => {
  const { service } = makeDeps({ user: invitedUser });
  await assert.rejects(
    () => service.resendInvite('t1', 'u2'),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('resendInvite troca token e validade sem mexer nos grupos', async () => {
  const { service, calls } = makeDeps({
    user: invitedUser,
    invitation: { id: 'inv1' },
  });
  const result = await service.resendInvite('t1', 'u2');

  assert.equal(calls.updates.length, 1);
  const { where, data } = calls.updates[0];
  assert.deepEqual(where, { id: 'inv1' });
  assert.deepEqual(Object.keys(data).sort(), ['expiresAt', 'token']);
  assert.equal(result.url, `https://painel.exemplo/convite/${data.token}`);
  assert.ok((data.expiresAt as Date).getTime() > Date.now() + 6 * 86400_000);
  assert.equal(result.emailSent, true);
  assert.equal(calls.sent, 1);
});

test('resendInvite devolve o link mesmo quando o e-mail falha', async () => {
  const { service } = makeDeps({
    user: invitedUser,
    invitation: { id: 'inv1' },
    mailFails: true,
  });
  const result = await service.resendInvite('t1', 'u2');
  assert.equal(result.emailSent, false);
});
