import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import { PlatformAdminGuard } from './platform-admin.guard';
import type { AuthUser } from './auth-user';

function makeContext(user?: AuthUser) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as Parameters<PlatformAdminGuard['canActivate']>[0];
}

test('PlatformAdminGuard permite PLATFORM_ADMIN', () => {
  const guard = new PlatformAdminGuard();
  assert.equal(
    guard.canActivate(
      makeContext({
        userId: 'u1',
        tenantId: 't1',
        tenantSlug: 'demo',
        email: 'a@b.c',
        role: AdminUserRole.PLATFORM_ADMIN,
        status: AdminUserStatus.ACTIVE,
        permissions: {},
      }),
    ),
    true,
  );
});

test('PlatformAdminGuard bloqueia TENANT_ADMIN', () => {
  const guard = new PlatformAdminGuard();
  assert.throws(
    () =>
      guard.canActivate(
        makeContext({
          userId: 'u1',
          tenantId: 't1',
          tenantSlug: 'x',
          email: 'a@b.c',
          role: AdminUserRole.TENANT_ADMIN,
          status: AdminUserStatus.ACTIVE,
          permissions: {},
        }),
      ),
    ForbiddenException,
  );
});

test('PlatformAdminGuard bloqueia sem utilizador', () => {
  const guard = new PlatformAdminGuard();
  assert.throws(() => guard.canActivate(makeContext(undefined)), ForbiddenException);
});
