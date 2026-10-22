const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

export interface RevalidationTargets {
  /** slug do tenant → origens (sem barra final) */
  byTenant: Map<string, string[]>;
  /** entradas descartadas (sem expor o valor completo) */
  rejected: string[];
}

/** Normaliza uma origem de destino; null se não for permitida. */
export function normalizeRevalidationTarget(
  raw: unknown,
  production: boolean,
): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  if (url.protocol === 'https:') {
    return url.origin;
  }
  if (
    url.protocol === 'http:' &&
    !production &&
    LOCAL_HOST_RE.test(url.hostname)
  ) {
    return url.origin;
  }
  return null;
}

/**
 * Interpreta SITE_REVALIDATION_TARGETS: {"<slug>": ["https://site", ...]}.
 * Lança Error se o JSON for inválido ou não tiver o formato esperado.
 */
export function parseRevalidationTargets(
  raw: string,
  production: boolean,
): RevalidationTargets {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SITE_REVALIDATION_TARGETS deve ser um objeto JSON');
  }
  const byTenant = new Map<string, string[]>();
  const rejected: string[] = [];
  for (const [slug, list] of Object.entries(parsed)) {
    if (!Array.isArray(list)) {
      throw new Error(`SITE_REVALIDATION_TARGETS["${slug}"] deve ser uma lista`);
    }
    const origins: string[] = [];
    for (const item of list) {
      const origin = normalizeRevalidationTarget(item, production);
      if (!origin) {
        rejected.push(slug);
      } else if (!origins.includes(origin)) {
        origins.push(origin);
      }
    }
    if (origins.length > 0) {
      byTenant.set(slug, origins);
    }
  }
  return { byTenant, rejected };
}

export function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  if (cause instanceof Error) {
    const code =
      'code' in cause && typeof (cause as NodeJS.ErrnoException).code === 'string'
        ? ` [${(cause as NodeJS.ErrnoException).code}]`
        : '';
    return `${cause.message}${code}`;
  }
  return error.message;
}
