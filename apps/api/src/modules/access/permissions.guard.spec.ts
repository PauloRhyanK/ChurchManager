import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AdminUserRole, AdminUserStatus, PermissionLevel, PermissionModule } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from './permissions.guard';
import type { RequiredPermission } from './require-permission.decorator';

function makeContext(user?: AuthUser) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as Parameters<PermissionsGuard['canActivate']>[0];
}

function makeGuard(required?: RequiredPermission) {
  const reflector = {
    getAllAndOverride: () => required,
  };
  return new PermissionsGuard(reflector as never);
}

function member(permissions: AuthUser['permissions']): AuthUser {
  return {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'demo',
    email: 'a@b.c',
    role: AdminUserRole.TENANT_MEMBER,
    status: AdminUserStatus.ACTIVE,
    permissions,
  };
}

test('sem permissão exigida, permite', () => {
  const guard = makeGuard(undefined);
  assert.equal(guard.canActivate(makeContext(member({}))), true);
});

test('super utilizador ignora verificação de grupos', () => {
  const guard = makeGuard({
    module: PermissionModule.EVENTS,
    level: PermissionLevel.EDIT,
  });
  const admin: AuthUser = {
    ...member({}),
    role: AdminUserRole.TENANT_ADMIN,
  };
  assert.equal(guard.canActivate(makeContext(admin)), true);
});

test('EDIT concedido satisfaz VIEW exigido', () => {
  const guard = makeGuard({
    module: PermissionModule.EVENTS,
    level: PermissionLevel.VIEW,
  });
  const user = member({ [PermissionModule.EVENTS]: PermissionLevel.EDIT });
  assert.equal(guard.canActivate(makeContext(user)), true);
});

test('VIEW concedido não satisfaz EDIT exigido', () => {
  const guard = makeGuard({
    module: PermissionModule.EVENTS,
    level: PermissionLevel.EDIT,
  });
  const user = member({ [PermissionModule.EVENTS]: PermissionLevel.VIEW });
  assert.throws(
    () => guard.canActivate(makeContext(user)),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test('sem permissão no módulo, bloqueia', () => {
  const guard = makeGuard({
    module: PermissionModule.FINANCIAL,
    level: PermissionLevel.VIEW,
  });
  const user = member({ [PermissionModule.EVENTS]: PermissionLevel.EDIT });
  assert.throws(
    () => guard.canActivate(makeContext(user)),
    (err: unknown) => err instanceof ForbiddenException,
  );
});
