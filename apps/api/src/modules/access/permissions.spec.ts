import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminUserRole, PermissionLevel, PermissionModule } from '@prisma/client';
import {
  allEditPermissions,
  isSuperRole,
  levelSatisfies,
  mergePermissionEntries,
  PERMISSION_MODULES,
} from './permissions';

test('isSuperRole reconhece TENANT_ADMIN e PLATFORM_ADMIN', () => {
  assert.equal(isSuperRole(AdminUserRole.TENANT_ADMIN), true);
  assert.equal(isSuperRole(AdminUserRole.PLATFORM_ADMIN), true);
  assert.equal(isSuperRole(AdminUserRole.TENANT_MEMBER), false);
});

test('levelSatisfies: EDIT satisfaz VIEW e EDIT; VIEW só satisfaz VIEW', () => {
  assert.equal(levelSatisfies(PermissionLevel.EDIT, PermissionLevel.VIEW), true);
  assert.equal(levelSatisfies(PermissionLevel.EDIT, PermissionLevel.EDIT), true);
  assert.equal(levelSatisfies(PermissionLevel.VIEW, PermissionLevel.VIEW), true);
  assert.equal(levelSatisfies(PermissionLevel.VIEW, PermissionLevel.EDIT), false);
  assert.equal(levelSatisfies(undefined, PermissionLevel.VIEW), false);
});

test('allEditPermissions cobre todos os módulos em EDIT', () => {
  const map = allEditPermissions();
  for (const module of PERMISSION_MODULES) {
    assert.equal(map[module], PermissionLevel.EDIT);
  }
});

test('mergePermissionEntries mantém o nível mais alto por módulo', () => {
  const merged = mergePermissionEntries([
    { module: PermissionModule.EVENTS, level: PermissionLevel.VIEW },
    { module: PermissionModule.EVENTS, level: PermissionLevel.EDIT },
    { module: PermissionModule.FINANCIAL, level: PermissionLevel.VIEW },
  ]);
  assert.equal(merged[PermissionModule.EVENTS], PermissionLevel.EDIT);
  assert.equal(merged[PermissionModule.FINANCIAL], PermissionLevel.VIEW);
});

test('mergePermissionEntries não rebaixa EDIT para VIEW', () => {
  const merged = mergePermissionEntries([
    { module: PermissionModule.EVENTS, level: PermissionLevel.EDIT },
    { module: PermissionModule.EVENTS, level: PermissionLevel.VIEW },
  ]);
  assert.equal(merged[PermissionModule.EVENTS], PermissionLevel.EDIT);
});
