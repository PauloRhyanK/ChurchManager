import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { PermissionGroupsService } from './permission-groups.service';
import { TenantUsersService } from './tenant-users.service';
import { SignupLinksService } from './signup-links.service';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GROUP_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('isolation: PermissionGroupsService.listForTenant filtra por tenantId', async () => {
  const capture: { where?: unknown } = {};
  const prisma = {
    permissionGroup: {
      findMany: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return [];
      },
    },
  };
  const service = new PermissionGroupsService(prisma as never);
  await service.listForTenant(TENANT_A);
  assert.deepEqual(capture.where, { tenantId: TENANT_A });
});

test('isolation: PermissionGroupsService.getForTenant devolve 404 para outro tenant', async () => {
  const capture: { where?: unknown } = {};
  const prisma = {
    permissionGroup: {
      findFirst: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return null;
      },
    },
  };
  const service = new PermissionGroupsService(prisma as never);
  await assert.rejects(
    () => service.getForTenant(TENANT_B, GROUP_A),
    (err: unknown) => err instanceof NotFoundException,
  );
  assert.deepEqual(capture.where, { id: GROUP_A, tenantId: TENANT_B });
});

test('isolation: TenantUsersService.listForTenant filtra por tenantId e exclui pendentes', async () => {
  const capture: { where?: unknown } = {};
  const prisma = {
    adminUser: {
      findMany: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return [];
      },
    },
  };
  const service = new TenantUsersService(prisma as never, {} as never);
  await service.listForTenant(TENANT_A);
  assert.deepEqual(capture.where, {
    tenantId: TENANT_A,
    status: { not: 'PENDING_APPROVAL' },
  });
});

test('isolation: SignupLinksService.listForTenant filtra por tenantId', async () => {
  const capture: { where?: unknown } = {};
  const prisma = {
    tenantSignupLink: {
      findMany: async ({ where }: { where: unknown }) => {
        capture.where = where;
        return [];
      },
    },
  };
  const config = { get: () => undefined };
  const service = new SignupLinksService(
    prisma as never,
    config as never,
    {} as never,
  );
  await service.listForTenant(TENANT_A);
  assert.deepEqual(capture.where, { tenantId: TENANT_A });
});
