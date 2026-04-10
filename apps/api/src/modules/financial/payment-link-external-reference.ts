/**
 * Prefixo versionado para correlacionar webhooks Asaas (`externalReference` do link).
 * Formato: `cm|v1|<tenantSlug>|<sourceKey>` (ex.: `cotas`, `events-<uuid>`).
 */
const PREFIX = 'cm|v1';

export function buildPaymentLinkExternalReference(
  tenantSlug: string,
  sourceKey: string,
): string {
  return `${PREFIX}|${tenantSlug}|${sourceKey}`;
}

export function parsePaymentLinkExternalReference(ref: string): {
  tenantSlug: string;
  sourceKey: string;
} | null {
  const parts = ref.split('|');
  if (parts.length !== 4 || parts[0] !== 'cm' || parts[1] !== 'v1') {
    return null;
  }
  return { tenantSlug: parts[2]!, sourceKey: parts[3]! };
}
