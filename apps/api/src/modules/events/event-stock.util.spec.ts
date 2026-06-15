import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTicketTypeOnSale,
  quantityRemaining,
  validateCheckoutLine,
} from './event-stock.util';

const baseType = {
  id: 't1',
  tenantId: 'tenant',
  eventId: 'e1',
  name: 'Inteira',
  description: null,
  priceCents: 5000,
  feeCents: 0,
  quantityTotal: 10,
  quantitySold: 8,
  minPerOrder: 1,
  maxPerOrder: 5,
  salesOpensAt: null,
  salesClosesAt: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

test('quantityRemaining calcula vagas restantes', () => {
  assert.equal(quantityRemaining(baseType), 2);
  assert.equal(quantityRemaining({ ...baseType, quantityTotal: null }), null);
});

test('validateCheckoutLine rejeita quantidade acima do estoque', () => {
  const err = validateCheckoutLine(baseType, 3);
  assert.match(err ?? '', /Estoque insuficiente/);
});

test('validateCheckoutLine aceita quantidade válida', () => {
  assert.equal(validateCheckoutLine(baseType, 2), null);
});

test('isTicketTypeOnSale false quando esgotado', () => {
  assert.equal(
    isTicketTypeOnSale({ ...baseType, quantitySold: 10 }),
    false,
  );
});
