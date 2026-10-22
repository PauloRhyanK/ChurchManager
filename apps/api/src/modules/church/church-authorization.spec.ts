import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AdminUserRole,
  AdminUserStatus,
  PermissionLevel,
  PermissionModule,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { PermissionsGuard } from '../access/permissions.guard';
import { BranchesController } from './branches.controller';
import { PastorsController } from './pastors.controller';
import { MinistriesController } from './ministries.controller';
import { ChurchConfigController } from './church-config.controller';
import { TenantsMeSchedulesController } from '../events/tenants-me-schedules.controller';

function member(level?: PermissionLevel): AuthUser {
  return {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'demo',
    email: 'a@b.c',
    role: AdminUserRole.TENANT_MEMBER,
    status: AdminUserStatus.ACTIVE,
    permissions: level ? { [PermissionModule.CHURCH]: level } : {},
  };
}

function check(
  controller: { prototype: object },
  method: string,
  user: AuthUser,
): boolean {
  const proto = controller.prototype as Record<string, (...a: never[]) => unknown>;
  const ctx = {
    getHandler: () => proto[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  return new PermissionsGuard(new Reflector()).canActivate(ctx as never);
}

const CONTROLLERS: Array<[string, { prototype: object }, string[], string[]]> = [
  ['branches', BranchesController, ['list', 'get'], ['create', 'update', 'remove']],
  ['pastors', PastorsController, ['list'], ['create', 'update', 'remove']],
  ['ministries', MinistriesController, ['list'], ['create', 'update', 'remove']],
  ['church-config', ChurchConfigController, ['get'], ['update', 'uploadImage']],
  ['schedules', TenantsMeSchedulesController, ['list'], ['create', 'update', 'remove']],
];

for (const [name, controller, reads, writes] of CONTROLLERS) {
  test(`${name}: CHURCH:VIEW lê mas recebe 403 nas escritas`, () => {
    const viewer = member(PermissionLevel.VIEW);
    for (const m of reads) assert.equal(check(controller, m, viewer), true, m);
    for (const m of writes) {
      assert.throws(() => check(controller, m, viewer), ForbiddenException, m);
    }
  });

  test(`${name}: sem permissão em CHURCH recebe 403 até na leitura`, () => {
    for (const m of reads) {
      assert.throws(() => check(controller, m, member()), ForbiddenException, m);
    }
  });

  test(`${name}: CHURCH:EDIT pode escrever`, () => {
    const editor = member(PermissionLevel.EDIT);
    for (const m of [...reads, ...writes]) assert.equal(check(controller, m, editor), true, m);
  });
}
