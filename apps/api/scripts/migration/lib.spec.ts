import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBcryptHash,
  parseStagingDate,
  parseStagingTime,
} from './lib';

test('isBcryptHash reconhece hashes válidos', () => {
  assert.equal(isBcryptHash('$2b$10$abcdefghijklmnopqrstuu'), true);
  assert.equal(isBcryptHash('plain-text'), false);
});

test('parseStagingDate converte YYYY-MM-DD', () => {
  const d = parseStagingDate('2026-06-12');
  assert.equal(d.toISOString().slice(0, 10), '2026-06-12');
});

test('parseStagingTime converte HH:MM:SS', () => {
  const t = parseStagingTime('19:30:00');
  assert.equal(t?.getUTCHours(), 19);
  assert.equal(t?.getUTCMinutes(), 30);
});
