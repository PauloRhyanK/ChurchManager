import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { ParticipantSecretGuard } from './participant-secret.guard';

const SECRET = 'segredo-compartilhado-com-o-site';
const ORIGINAL_ENV = {
  secret: process.env.PUBLIC_PARTICIPANT_API_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore('PUBLIC_PARTICIPANT_API_SECRET', ORIGINAL_ENV.secret);
  restore('NODE_ENV', ORIGINAL_ENV.nodeEnv);
});

function setEnv(secret: string | undefined, nodeEnv: string | undefined) {
  restore('PUBLIC_PARTICIPANT_API_SECRET', secret);
  restore('NODE_ENV', nodeEnv);
}

function context(headers: Record<string, string | undefined>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as Parameters<ParticipantSecretGuard['canActivate']>[0];
}

function rejectsUnauthorized(fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof UnauthorizedException);
    assert.equal(err.message, 'Acesso não autorizado');
    return true;
  });
}

const guard = new ParticipantSecretGuard();

test('sem segredo configurado em produção responde 401', () => {
  setEnv(undefined, 'production');
  rejectsUnauthorized(() =>
    guard.canActivate(context({ 'x-participant-secret': 'qualquer' })),
  );
});

test('segredo só com espaços em produção conta como ausente (401)', () => {
  setEnv('   ', 'production');
  rejectsUnauthorized(() => guard.canActivate(context({})));
});

test('sem segredo configurado fora de produção permite (dev)', () => {
  setEnv(undefined, 'development');
  assert.equal(guard.canActivate(context({})), true);
});

test('com segredo configurado, header ausente responde 401', () => {
  setEnv(SECRET, 'production');
  rejectsUnauthorized(() => guard.canActivate(context({})));
});

test('header errado responde 401 (mesmo tamanho e tamanho diferente)', () => {
  setEnv(SECRET, 'production');
  const sameLength = 'x'.repeat(SECRET.length);
  rejectsUnauthorized(() =>
    guard.canActivate(context({ 'x-participant-secret': sameLength })),
  );
  rejectsUnauthorized(() =>
    guard.canActivate(context({ 'x-participant-secret': 'curto' })),
  );
});

test('com segredo configurado, header errado responde 401 também fora de produção', () => {
  setEnv(SECRET, 'development');
  rejectsUnauthorized(() =>
    guard.canActivate(context({ 'x-participant-secret': 'errado' })),
  );
});

test('header certo permite (segredo configurado com espaços nas pontas)', () => {
  setEnv(`  ${SECRET}\n`, 'production');
  assert.equal(
    guard.canActivate(context({ 'x-participant-secret': SECRET })),
    true,
  );
});
