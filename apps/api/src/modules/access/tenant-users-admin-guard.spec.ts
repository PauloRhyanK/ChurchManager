import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import { TenantUsersService } from './tenant-users.service';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQUESTER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function makeService(role: AdminUserRole) {
  const calls = {
    findFirstWhere: [] as unknown[],
    updates: [] as unknown[],
    deletes: [] as unknown[],
    invitationDeletes: [] as unknown[],
  };
  const row = {
    id: TARGET,
    email: 'alvo@igreja.test',
    name: 'Alvo',
    role,
    status: AdminUserStatus.ACTIVE,
    approvedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    permissionGroups: [],
  };
  const tx = {
    adminUser: {
      update: async (args: unknown) => {
        calls.updates.push(args);
        return row;
      },
      delete: async (args: unknown) => {
        calls.deletes.push(args);
        return row;
      },
    },
    adminUserInvitation: {
      deleteMany: async (args: unknown) => {
        calls.invitationDeletes.push(args);
        return { count: 0 };
      },
    },
    adminUserPermissionGroup: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
    },
  };
  const prisma = {
    adminUser: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.findFirstWhere.push(where);
        return row;
      },
    },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
  };
  const groups = {
    assertGroupsBelongToTenant: async (_tenantId: string, ids: string[]) =>
      ids,
  };
  const service = new TenantUsersService(prisma as never, groups as never);
  return { service, calls };
}

for (const role of [AdminUserRole.TENANT_ADMIN, AdminUserRole.PLATFORM_ADMIN]) {
  test(`admin guard: PATCH em ${role} devolve 400 sem alterar nada`, async () => {
    const { service, calls } = makeService(role);
    await assert.rejects(
      () =>
        service.updateForTenant(TENANT_A, TARGET, {
          status: AdminUserStatus.SUSPENDED,
          groupIds: [],
        }),
      (err: unknown) => err instanceof BadRequestException,
    );
    assert.deepEqual(calls.findFirstWhere[0], { id: TARGET, tenantId: TENANT_A });
    assert.equal(calls.updates.length, 0);
  });

  test(`admin guard: DELETE em ${role} devolve 400 sem remover`, async () => {
    const { service, calls } = makeService(role);
    await assert.rejects(
      () => service.remove(TENANT_A, TARGET, REQUESTER),
      (err: unknown) => err instanceof BadRequestException,
    );
    assert.deepEqual(calls.findFirstWhere[0], { id: TARGET, tenantId: TENANT_A });
    assert.equal(calls.deletes.length, 0);
    assert.equal(calls.invitationDeletes.length, 0);
  });
}

test('admin guard: PATCH em TENANT_MEMBER continua a funcionar', async () => {
  const { service, calls } = makeService(AdminUserRole.TENANT_MEMBER);
  const result = await service.updateForTenant(TENANT_A, TARGET, {
    status: AdminUserStatus.SUSPENDED,
  });
  assert.equal(calls.updates.length, 1);
  assert.deepEqual(calls.updates[0], {
    where: { id: TARGET },
    data: { name: undefined, status: AdminUserStatus.SUSPENDED },
  });
  assert.equal(result.id, TARGET);
});

test('admin guard: DELETE em TENANT_MEMBER continua a funcionar', async () => {
  const { service, calls } = makeService(AdminUserRole.TENANT_MEMBER);
  const result = await service.remove(TENANT_A, TARGET, REQUESTER);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls.findFirstWhere[0], { id: TARGET, tenantId: TENANT_A });
  assert.deepEqual(calls.deletes, [{ where: { id: TARGET } }]);
});
