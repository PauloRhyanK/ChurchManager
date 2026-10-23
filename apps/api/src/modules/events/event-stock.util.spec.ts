import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTicketTypeInSalesWindow,
  isTicketTypeOnSale,
  isTicketTypeSoldOut,
  quantityRemaining,
  validateCheckoutLine,
} from './event-stock.util';

import { EventTicketType } from '@prisma/client';

const baseType: EventTicketType = {
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
} as any;


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

test('isTicketTypeSoldOut: só com limite atingido', () => {
  assert.equal(isTicketTypeSoldOut({ ...baseType, quantitySold: 10 }), true);
  assert.equal(isTicketTypeSoldOut({ ...baseType, quantitySold: 12 }), true);
  assert.equal(isTicketTypeSoldOut({ ...baseType, quantitySold: 9 }), false);
  assert.equal(
    isTicketTypeSoldOut({ ...baseType, quantityTotal: null, quantitySold: 999 }),
    false,
  );
});

test('isTicketTypeInSalesWindow respeita abertura e fecho das vendas', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  assert.equal(isTicketTypeInSalesWindow(baseType, now), true);
  assert.equal(
    isTicketTypeInSalesWindow(
      { ...baseType, salesOpensAt: new Date('2026-10-23T00:00:00Z') },
      now,
    ),
    false,
  );
  assert.equal(
    isTicketTypeInSalesWindow(
      { ...baseType, salesClosesAt: new Date('2026-10-22T11:59:59Z') },
      now,
    ),
    false,
  );
  // Esgotado não é critério de janela.
  const soldOut: EventTicketType = { ...baseType, quantitySold: 10 };
  assert.equal(isTicketTypeInSalesWindow(soldOut, now), true);
});

test('isTicketTypeOnSale exige ativo, janela e estoque', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  assert.equal(isTicketTypeOnSale(baseType, now), true);
  assert.equal(isTicketTypeOnSale({ ...baseType, active: false }, now), false);
  assert.equal(
    isTicketTypeOnSale(
      { ...baseType, salesClosesAt: new Date('2026-10-22T11:00:00Z') },
      now,
    ),
    false,
  );
});
