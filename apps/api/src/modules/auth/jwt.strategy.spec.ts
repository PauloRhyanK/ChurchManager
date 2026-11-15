import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function strategy() {
  const config = { get: () => 'panel-secret' };
  const prisma = {
    adminUser: {
      findUnique: async () => {
        throw new Error('não deveria consultar utilizador');
      },
    },
  };
  return new JwtStrategy(config as never, prisma as never);
}

test('JwtStrategy: recusa JWT de contribuidor (aud=contributor)', async () => {
  await assert.rejects(
    () =>
      strategy().validate({
        tenantId: 't-1',
        cpf: '52998224725',
        aud: 'contributor',
      } as never),
    UnauthorizedException,
  );
});

test('JwtStrategy: recusa payload sem sub', async () => {
  await assert.rejects(
    () => strategy().validate({ tenantId: 't-1' } as never),
    UnauthorizedException,
  );
});
