const LOCAL_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Origem usada só para webhook de revalidação (servidor → site público). */
export function pickRevalidationOrigin(origins: readonly string[]): string | null {
  const normalized = origins
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (normalized.length === 0) {
    return null;
  }

  const remoteHttps = normalized.find(
    (o) => o.startsWith('https://') && !LOCAL_ORIGIN_RE.test(o),
  );
  if (remoteHttps) {
    return remoteHttps;
  }

  const remote = normalized.find((o) => !LOCAL_ORIGIN_RE.test(o));
  if (remote) {
    return remote;
  }

  return normalized[0] ?? null;
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
