import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLegacyWrongOneMonthRecurrentLink,
  isSinglePaymentCharge,
  normalizeSinglePaymentCharge,
  storedLinkMatchesChargeIntent,
} from './payment-link-charge-intent';

test('isSinglePaymentCharge: único ou 1 mês', () => {
  assert.equal(isSinglePaymentCharge({ isMonthly: false }), true);
  assert.equal(
    isSinglePaymentCharge({ isMonthly: true, subscriptionDurationMonths: 1 }),
    true,
  );
  assert.equal(
    isSinglePaymentCharge({ isMonthly: true, subscriptionDurationMonths: 6 }),
    false,
  );
});

test('normalizeSinglePaymentCharge: 1 mês vira pagamento único', () => {
  const out = normalizeSinglePaymentCharge({
    isMonthly: true,
    subscriptionDurationMonths: 1,
  });
  assert.equal(out.isMonthly, false);
  assert.equal(out.subscriptionDurationMonths, undefined);
});

test('isLegacyWrongOneMonthRecurrentLink', () => {
  assert.equal(
    isLegacyWrongOneMonthRecurrentLink({
      isMonthly: true,
      subscriptionDurationMonths: 1,
    }),
    true,
  );
  assert.equal(
    isLegacyWrongOneMonthRecurrentLink({
      isMonthly: false,
      subscriptionDurationMonths: null,
    }),
    false,
  );
});

test('storedLinkMatchesChargeIntent', () => {
  assert.equal(
    storedLinkMatchesChargeIntent(
      { isMonthly: false, subscriptionDurationMonths: null },
      { isMonthly: false },
    ),
    true,
  );
  assert.equal(
    storedLinkMatchesChargeIntent(
      { isMonthly: true, subscriptionDurationMonths: 12 },
      { isMonthly: true, subscriptionDurationMonths: 6 },
    ),
    false,
  );
});
