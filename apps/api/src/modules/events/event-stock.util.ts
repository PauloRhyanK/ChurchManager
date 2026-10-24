import { EventTicketType } from '@prisma/client';

export type CheckoutLine = { ticketTypeId: string; quantity: number };

export function quantityRemaining(type: Pick<EventTicketType, 'quantityTotal' | 'quantitySold'>): number | null {
  if (type.quantityTotal == null) return null;
  return Math.max(0, type.quantityTotal - type.quantitySold);
}

/** Dentro da janela de venda (`salesOpensAt` / `salesClosesAt`), sem olhar estoque. */
export function isTicketTypeInSalesWindow(
  type: Pick<EventTicketType, 'salesOpensAt' | 'salesClosesAt'>,
  now = new Date(),
): boolean {
  if (type.salesOpensAt && now < type.salesOpensAt) return false;
  if (type.salesClosesAt && now > type.salesClosesAt) return false;
  return true;
}

/** Sem vagas: há limite (`quantityTotal`) e ele já foi atingido. */
export function isTicketTypeSoldOut(
  type: Pick<EventTicketType, 'quantityTotal' | 'quantitySold'>,
): boolean {
  return type.quantityTotal !== null && type.quantitySold >= type.quantityTotal;
}

/** À venda: ativo, dentro da janela e com estoque (regra do checkout). */
export function isTicketTypeOnSale(
  type: Pick<
    EventTicketType,
    'active' | 'salesOpensAt' | 'salesClosesAt' | 'quantityTotal' | 'quantitySold'
  >,
  now = new Date(),
): boolean {
  return (
    type.active &&
    isTicketTypeInSalesWindow(type, now) &&
    !isTicketTypeSoldOut(type)
  );
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
