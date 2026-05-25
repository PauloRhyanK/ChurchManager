import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarMonths,
  computeSubscriptionEndDateYmd,
  toLocalDateYmd,
} from './payment-link-subscription-end';

test('addCalendarMonths: Jan 31 + 1 mês → último dia de Fevereiro', () => {
  const from = new Date(2026, 0, 31);
  const out = addCalendarMonths(from, 1);
  assert.equal(toLocalDateYmd(out), '2026-02-28');
});

test('computeSubscriptionEndDateYmd: N=3 com referência fixa (addMonths - 1 dia)', () => {
  const ref = new Date(2026, 3, 18);
  assert.equal(computeSubscriptionEndDateYmd(3, ref), '2026-07-17');
});

test('computeSubscriptionEndDateYmd: N=2 a partir de 30 Abr 2026', () => {
  const ref = new Date(2026, 3, 30);
  assert.equal(computeSubscriptionEndDateYmd(2, ref), '2026-06-29');
});

test('computeSubscriptionEndDateYmd: N=2 a partir de 31 Jan 2026 (mês curto)', () => {
  const ref = new Date(2026, 0, 31);
  assert.equal(computeSubscriptionEndDateYmd(2, ref), '2026-03-30');
});

test('computeSubscriptionEndDateYmd: N=12 a partir de 29 Fev 2028 (bissexto)', () => {
  const ref = new Date(2028, 1, 29);
  assert.equal(computeSubscriptionEndDateYmd(12, ref), '2029-02-27');
});
