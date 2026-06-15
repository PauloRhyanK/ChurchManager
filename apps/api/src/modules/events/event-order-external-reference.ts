/** Correlaciona cobrança Asaas com pedido de evento (`externalReference`). */
const PREFIX = 'cm|event-order|v1';

export function buildEventOrderExternalReference(
  tenantSlug: string,
  orderId: string,
): string {
  return `${PREFIX}|${tenantSlug}|${orderId}`;
}

export function parseEventOrderExternalReference(ref: string): {
  tenantSlug: string;
  orderId: string;
} | null {
  const parts = ref.split('|');
  if (
    parts.length !== 5 ||
    parts[0] !== 'cm' ||
    parts[1] !== 'event-order' ||
    parts[2] !== 'v1'
  ) {
    return null;
  }
  return { tenantSlug: parts[3]!, orderId: parts[4]! };
}
