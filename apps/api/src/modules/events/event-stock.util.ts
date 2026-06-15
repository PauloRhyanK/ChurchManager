import { EventTicketType } from '@prisma/client';

export type CheckoutLine = { ticketTypeId: string; quantity: number };

export function quantityRemaining(type: Pick<EventTicketType, 'quantityTotal' | 'quantitySold'>): number | null {
  if (type.quantityTotal == null) return null;
  return Math.max(0, type.quantityTotal - type.quantitySold);
}

export function isTicketTypeOnSale(
  type: Pick<
    EventTicketType,
    'active' | 'salesOpensAt' | 'salesClosesAt' | 'quantityTotal' | 'quantitySold'
  >,
  now = new Date(),
): boolean {
  if (!type.active) return false;
  if (type.salesOpensAt && now < type.salesOpensAt) return false;
  if (type.salesClosesAt && now > type.salesClosesAt) return false;
  const remaining = quantityRemaining(type);
  if (remaining !== null && remaining <= 0) return false;
  return true;
}

export function validateCheckoutLine(
  type: EventTicketType,
  quantity: number,
  now = new Date(),
): string | null {
  if (!isTicketTypeOnSale(type, now)) {
    return `Ingresso "${type.name}" indisponível`;
  }
  if (quantity < type.minPerOrder) {
    return `Quantidade mínima para "${type.name}": ${type.minPerOrder}`;
  }
  if (quantity > type.maxPerOrder) {
    return `Quantidade máxima para "${type.name}": ${type.maxPerOrder}`;
  }
  const remaining = quantityRemaining(type);
  if (remaining !== null && quantity > remaining) {
    return `Estoque insuficiente para "${type.name}"`;
  }
  return null;
}
