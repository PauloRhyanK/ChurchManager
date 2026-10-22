import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EVENT_TIMEZONE,
  formatDateOnly,
  formatTimeOnly,
  parseDateOnly,
  parseTimeOnly,
  safeTimeZone,
  startOfTodayInTimeZone,
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

test('fuso padrão dos eventos é America/Sao_Paulo', () => {
  assert.equal(DEFAULT_EVENT_TIMEZONE, 'America/Sao_Paulo');
});

test('startOfTodayInTimeZone: 20:30 BRT ainda é o dia 22', () => {
  const today = startOfTodayInTimeZone(
    'America/Sao_Paulo',
    new Date('2026-10-22T23:30:00Z'),
  );
  assert.equal(today.toISOString(), '2026-10-22T00:00:00.000Z');
});

test('startOfTodayInTimeZone: 21:30 BRT (já dia 23 em UTC) ainda é o dia 22', () => {
  const today = startOfTodayInTimeZone(
    'America/Sao_Paulo',
    new Date('2026-10-23T00:30:00Z'),
  );
  assert.equal(today.toISOString(), '2026-10-22T00:00:00.000Z');
});

test('startOfTodayInTimeZone: meia-noite BRT vira o dia 23', () => {
  const today = startOfTodayInTimeZone(
    'America/Sao_Paulo',
    new Date('2026-10-23T03:00:00Z'),
  );
  assert.equal(today.toISOString(), '2026-10-23T00:00:00.000Z');
});

test('startOfTodayInTimeZone usa America/Sao_Paulo por padrão', () => {
  const today = startOfTodayInTimeZone(undefined, new Date('2026-10-23T00:30:00Z'));
  assert.equal(formatDateOnly(today), '2026-10-22');
});

test('safeTimeZone mantém um fuso IANA válido', () => {
  assert.equal(safeTimeZone('America/Manaus'), 'America/Manaus');
  assert.equal(safeTimeZone('UTC'), 'UTC');
});

test('safeTimeZone troca fuso inválido ou vazio pelo padrão', () => {
  assert.equal(safeTimeZone('Marte/Olympus'), DEFAULT_EVENT_TIMEZONE);
  assert.equal(safeTimeZone(''), DEFAULT_EVENT_TIMEZONE);
});
