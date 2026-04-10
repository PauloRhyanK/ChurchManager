import { createHash } from 'node:crypto';

/** Payload mínimo para derivar chave de idempotência (única por tenant). */
export interface AsaasWebhookIdempotencyInput {
  id?: string;
  event?: string;
  payment?: { id?: string };
  subscription?: { id?: string };
}

const MAX_KEY_LEN = 256;

/**
 * Chave estável por entrega: header > body.id (Asaas) > fallback tenant+event+resource.
 * Prefixo com tenantId evita colisão entre igrejas. Encurta com SHA-256 se > 256 chars.
 */
export function buildWebhookIdempotencyKey(
  tenantId: string,
  idempotencyHeader: string | undefined,
  body: AsaasWebhookIdempotencyInput,
): string {
  const trimmed = idempotencyHeader?.trim();
  let raw: string;
  if (trimmed) {
    raw = `${tenantId}:hdr:${trimmed}`;
  } else if (body.id != null && String(body.id).length > 0) {
    raw = `${tenantId}:evt:${body.id}`;
  } else {
    const event = body.event ?? 'UNKNOWN';
    const resourceId =
      body.payment?.id ?? body.subscription?.id ?? 'unknown';
    raw = `${tenantId}:${event}:${resourceId}`;
  }
  if (raw.length <= MAX_KEY_LEN) {
    return raw;
  }
  return createHash('sha256').update(raw).digest('hex');
}
