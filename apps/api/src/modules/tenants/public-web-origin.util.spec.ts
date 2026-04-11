import assert from 'node:assert/strict';
import test from 'node:test';
import {
  originMatchesAllowlist,
  parsePublicWebOrigin,
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
