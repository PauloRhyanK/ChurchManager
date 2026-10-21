import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

async function makeDeps() {
  const passwordHash = await bcrypt.hash('senhaAtual1', 10);
  const calls = {
    updatedHash: undefined as string | undefined,
    invalidated: 0,
  };
  const tx = {
    adminUser: {
      update: async ({ data }: { data: { passwordHash: string } }) => {
        calls.updatedHash = data.passwordHash;
      },
    },
    adminPasswordReset: {
      updateMany: async () => {
        calls.invalidated += 1;
      },
    },
  };
  const prisma = {
    adminUser: { findUnique: async () => ({ id: 'u1', passwordHash }) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const service = new AuthService(prisma as never, {} as never);
  return { service, calls };
}

test('changePassword com senha atual errada devolve 400, não 401', async () => {
  const { service, calls } = await makeDeps();
  await assert.rejects(
    () =>
      service.changePassword('u1', {
        currentPassword: 'errada123',
        newPassword: 'novaSenha1',
      }),
    (err: unknown) => err instanceof BadRequestException,
  );
  assert.equal(calls.updatedHash, undefined);
});

test('changePassword rejeita nova senha igual à atual', async () => {
  const { service } = await makeDeps();
  await assert.rejects(
    () =>
      service.changePassword('u1', {
        currentPassword: 'senhaAtual1',
        newPassword: 'senhaAtual1',
      }),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('changePassword grava novo hash e invalida links pendentes', async () => {
  const { service, calls } = await makeDeps();
  const result = await service.changePassword('u1', {
    currentPassword: 'senhaAtual1',
    newPassword: 'novaSenha1',
  });
  assert.deepEqual(result, { ok: true });
  assert.ok(calls.updatedHash);
  assert.ok(await bcrypt.compare('novaSenha1', calls.updatedHash!));
  assert.equal(calls.invalidated, 1);
});
