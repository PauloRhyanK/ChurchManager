import assert from 'node:assert/strict';
import test from 'node:test';

test('sem SENTRY_DSN o instrument não inicia o SDK (testes e local)', async () => {
  delete process.env.SENTRY_DSN;
  await import('./instrument');
  const Sentry = await import('@sentry/nestjs');
  assert.equal(Sentry.getClient(), undefined);
});
