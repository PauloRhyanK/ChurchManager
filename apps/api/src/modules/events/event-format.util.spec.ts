import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDateOnly,
  formatTimeOnly,
  parseDateOnly,
  parseTimeOnly,
} from './event-format.util';

test('formats and parses date only', () => {
  const d = parseDateOnly('2026-06-12');
  assert.equal(formatDateOnly(d), '2026-06-12');
});

test('formats and parses time only', () => {
  const t = parseTimeOnly('19:30:00');
  assert.equal(formatTimeOnly(t), '19:30:00');
});

test('accepts HH:MM without seconds', () => {
  const t = parseTimeOnly('19:30');
  assert.equal(formatTimeOnly(t), '19:30:00');
});
