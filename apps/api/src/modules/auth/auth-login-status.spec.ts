import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

const jwtStub = { signAsync: async () => 'token' };

function makePrisma(user: unknown) {
  return {
    adminUser: {
      findUnique: async () => user,
      // resolvePermissions só é chamado para utilizadores ativos
    },
    adminUserPermissionGroup: {
      findMany: async () => [],
    },
  };
}

test('login bloqueia utilizador PENDING_APPROVAL', async () => {
  const passwordHash = await bcrypt.hash('secret123', 10);
  const prisma = makePrisma({
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.c',
    name: null,
    passwordHash,
    role: AdminUserRole.TENANT_MEMBER,
    status: AdminUserStatus.PENDING_APPROVAL,
    tenant: { slug: 'demo' },
  });
  const service = new AuthService(prisma as never, jwtStub as never);
  await assert.rejects(
    () => service.login({ email: 'a@b.c', password: 'secret123' }),
    (err: unknown) => err instanceof UnauthorizedException,
  );
});

test('login bloqueia utilizador INVITED (sem senha definida)', async () => {
  const prisma = makePrisma({
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.c',
    name: null,
    passwordHash: null,
    role: AdminUserRole.TENANT_MEMBER,
    status: AdminUserStatus.INVITED,
    tenant: { slug: 'demo' },
  });
  const service = new AuthService(prisma as never, jwtStub as never);
  await assert.rejects(
    () => service.login({ email: 'a@b.c', password: 'whatever1' }),
    (err: unknown) => err instanceof UnauthorizedException,
  );
});

test('login de TENANT_ADMIN ativo devolve token e permissões totais', async () => {
  const passwordHash = await bcrypt.hash('secret123', 10);
  const prisma = makePrisma({
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.c',
    name: 'Admin',
    passwordHash,
    role: AdminUserRole.TENANT_ADMIN,
    status: AdminUserStatus.ACTIVE,
    tenant: { slug: 'demo' },
  });
  const service = new AuthService(prisma as never, jwtStub as never);
  const result = await service.login({ email: 'a@b.c', password: 'secret123' });
  assert.equal(result.accessToken, 'token');
  assert.equal(result.user.role, AdminUserRole.TENANT_ADMIN);
  assert.equal(result.user.permissions.EVENTS, 'EDIT');
  assert.equal(result.user.permissions.FINANCIAL, 'EDIT');
});
