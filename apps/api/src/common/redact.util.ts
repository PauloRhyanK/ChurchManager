const SENSITIVE_KEYS = new Set([
  'asaasApiKey',
  'asaasWebhookToken',
  'apiKey',
  'webhookToken',
  'access_token',
]);

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSecrets(val);
      }
    }
    return out as T;
  }
  return value;
}

