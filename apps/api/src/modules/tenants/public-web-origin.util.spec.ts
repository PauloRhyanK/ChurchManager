import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  assertPublicPaymentSuccessUrlAllowed,
  originMatchesAllowlist,
  parsePublicWebOrigin,
  resolveEffectivePaymentSuccessUrl,
  successUrlAllowedByPublicOrigins,
} from './public-web-origin.util';

test('parsePublicWebOrigin: aceita URL completa', () => {
  assert.equal(parsePublicWebOrigin('https://www.exemplo.org/'), 'https://www.exemplo.org');
});

test('parsePublicWebOrigin: localhost sem esquema usa http', () => {
  assert.equal(parsePublicWebOrigin('localhost:3001'), 'http://localhost:3001');
});

test('parsePublicWebOrigin: domínio sem esquema usa https', () => {
  assert.equal(parsePublicWebOrigin('igreja.org'), 'https://igreja.org');
});

test('originMatchesAllowlist: equivalência canónica', () => {
  assert.equal(
    originMatchesAllowlist('http://localhost:3001', [
      'http://localhost:3001',
    ]),
    true,
  );
  assert.equal(
    originMatchesAllowlist('http://localhost:3001', [
      'http://localhost:3001/',
    ]),
    true,
  );
});

test('successUrlAllowedByPublicOrigins: HTTPS com path e origem na lista', () => {
  assert.equal(
    successUrlAllowedByPublicOrigins(
      'https://cotas.exemplo.org/obrigado?x=1',
      ['https://cotas.exemplo.org'],
    ),
    true,
  );
});

test('successUrlAllowedByPublicOrigins: rejeita HTTPS se origin não está na lista', () => {
  assert.equal(
    successUrlAllowedByPublicOrigins('https://outro.org/', [
      'https://cotas.exemplo.org',
    ]),
    false,
  );
});

test('successUrlAllowedByPublicOrigins: http só em localhost', () => {
  assert.equal(
    successUrlAllowedByPublicOrigins('http://localhost:3001/obrigado', [
      'http://localhost:3001',
    ]),
    true,
  );
  assert.equal(
    successUrlAllowedByPublicOrigins('http://evil.com/', [
      'http://localhost:3001',
    ]),
    false,
  );
});

test('assertPublicPaymentSuccessUrlAllowed: autoRedirect sem successUrl', () => {
  assert.throws(
    () =>
      assertPublicPaymentSuccessUrlAllowed(undefined, false, [
        'https://a.com',
      ]),
    BadRequestException,
  );
});

test('assertPublicPaymentSuccessUrlAllowed: sem successUrl e sem autoRedirect', () => {
  assert.doesNotThrow(() =>
    assertPublicPaymentSuccessUrlAllowed(undefined, undefined, []),
  );
});

test('resolveEffectivePaymentSuccessUrl: prioriza body sobre tenant', () => {
  assert.equal(
    resolveEffectivePaymentSuccessUrl('https://a.com/x', 'https://b.com/y'),
    'https://a.com/x',
  );
  assert.equal(
    resolveEffectivePaymentSuccessUrl(undefined, 'https://b.com/y?z=1'),
    'https://b.com/y?z=1',
  );
  assert.equal(resolveEffectivePaymentSuccessUrl(undefined, null), undefined);
});
