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

test('computeSubscriptionEndDateYmd: referência fixa + 3 meses', () => {
  const ref = new Date(2026, 3, 18);
  assert.equal(computeSubscriptionEndDateYmd(3, ref), '2026-07-18');
});
