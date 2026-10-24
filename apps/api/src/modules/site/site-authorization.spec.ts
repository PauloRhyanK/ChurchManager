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
import { PermissionsGuard } from '../access/permissions.guard';
import type { AuthUser } from '../auth/auth-user';
import { TenantsMeSiteContentController } from './tenants-me-site-content.controller';

function member(level?: PermissionLevel): AuthUser {
  return {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'demo',
    email: 'a@b.c',
    role: AdminUserRole.TENANT_MEMBER,
    status: AdminUserStatus.ACTIVE,
    permissions: level ? { [PermissionModule.SITE]: level } : {},
  };
}

function check(method: string, user: AuthUser): boolean {
  const proto = TenantsMeSiteContentController.prototype as unknown as Record<string, unknown>;
  const ctx = {
    getHandler: () => proto[method],
    getClass: () => TenantsMeSiteContentController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  return new PermissionsGuard(new Reflector()).canActivate(ctx as never);
}

test('site-content: SITE:VIEW lê, mas recebe 403 em PUT, DELETE e upload', () => {
  const viewer = member(PermissionLevel.VIEW);
  for (const m of ['list', 'get', 'schema']) assert.equal(check(m, viewer), true, m);
  for (const m of ['update', 'reset', 'uploadImage']) {
    assert.throws(() => check(m, viewer), ForbiddenException, m);
  }
});

test('site-content: sem permissão em SITE recebe 403 até na leitura', () => {
  assert.throws(() => check('list', member()), ForbiddenException);
});

test('site-content: SITE:EDIT pode escrever', () => {
  const editor = member(PermissionLevel.EDIT);
  for (const m of ['list', 'update', 'reset', 'uploadImage']) {
    assert.equal(check(m, editor), true, m);
  }
});

test('site-layout: SITE:VIEW lê a ordem, mas recebe 403 ao salvar; SITE:EDIT salva', () => {
  const viewer = member(PermissionLevel.VIEW);
  assert.equal(check('getLayout', viewer), true);
  assert.throws(() => check('updateLayout', viewer), ForbiddenException);
  assert.equal(check('updateLayout', member(PermissionLevel.EDIT)), true);
  assert.throws(() => check('getLayout', member()), ForbiddenException);
});
