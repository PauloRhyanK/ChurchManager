import assert from 'node:assert/strict';
import test from 'node:test';
import { inferSubscriptionMonthsFromDescription } from './infer-subscription-months-from-description';

test('inferSubscriptionMonthsFromDescription extrai meses', () => {
  assert.equal(
    inferSubscriptionMonthsFromDescription(
      'Assinatura mensal — 5 meses (link público)',
    ),
    5,
  );
  assert.equal(
    inferSubscriptionMonthsFromDescription('12 meses restantes'),
    12,
  );
  assert.equal(inferSubscriptionMonthsFromDescription(null), null);
  assert.equal(inferSubscriptionMonthsFromDescription(''), null);
  assert.equal(
    inferSubscriptionMonthsFromDescription('Pagamento único'),
    null,
  );
});
