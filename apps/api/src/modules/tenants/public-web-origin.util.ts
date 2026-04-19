import { BadRequestException } from '@nestjs/common';

/**
 * Normaliza o texto introduzido pelo utilizador para `scheme://host[:port]`
 * (sem path). Aceita `localhost:3001` sem esquema (assume `http://`).
 */
export function parsePublicWebOrigin(raw: string): string {
  let trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException('Origem em falta.');
  }
  trimmed = trimmed.replace(/\/+$/, '');

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    const hostPort = candidate.split('/')[0] ?? '';
    const isLocal =
      /^(localhost)(:\d+)?$/i.test(hostPort) ||
      /^(127\.0\.0\.1)(:\d+)?$/i.test(hostPort) ||
      /^\[::1\](:\d+)?$/i.test(hostPort);
    candidate = `${isLocal ? 'http' : 'https'}://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BadRequestException('Origem inválida (URL mal formada).');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('A origem deve usar http ou https.');
  }
  if (url.username || url.password) {
    throw new BadRequestException('A origem não pode incluir credenciais.');
  }
  return url.origin;
}

/** Compara o cabeçalho `Origin` do browser com a lista guardada (canónico). */
export function originMatchesAllowlist(
  requestOrigin: string,
  allowed: readonly string[],
): boolean {
  let reqCanon: string;
  try {
    reqCanon = new URL(requestOrigin).origin;
  } catch {
    return false;
  }
  for (const item of allowed) {
    try {
      if (new URL(item).origin === reqCanon) {
        return true;
      }
    } catch {
      if (item === requestOrigin) {
        return true;
      }
    }
  }
  return false;
}

const LOCAL_HTTP_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Indica se `successUrl` é permitido como retorno pós-pagamento: HTTPS (ou HTTP só em
 * localhost / 127.0.0.1 / ::1) e o `origin` coincide com uma origem pública do tenant.
 */
export function successUrlAllowedByPublicOrigins(
  successUrl: string,
  allowedOrigins: readonly string[],
): boolean {
  let url: URL;
  try {
    url = new URL(successUrl);
  } catch {
    return false;
  }
  if (url.username || url.password) {
    return false;
  }
  const origin = url.origin;
  if (url.protocol === 'http:') {
    if (!LOCAL_HTTP_ORIGIN_RE.test(origin)) {
      return false;
    }
  } else if (url.protocol !== 'https:') {
    return false;
  }
  return originMatchesAllowlist(origin, allowedOrigins);
}

/**
 * Prioridade: URL enviada no pedido público; senão URL por defeito do tenant (painel).
 */
export function resolveEffectivePaymentSuccessUrl(
  requestSuccessUrl: string | undefined,
  tenantDefault: string | null | undefined,
): string | undefined {
  const fromBody = requestSuccessUrl?.trim();
  if (fromBody) {
    return fromBody;
  }
  const fromTenant = tenantDefault?.trim();
  return fromTenant || undefined;
}

/** Valida `successUrl` / `autoRedirect` antes de enviar `callback` ao Asaas. */
export function assertPublicPaymentSuccessUrlAllowed(
  successUrl: string | undefined,
  autoRedirect: boolean | undefined,
  allowedOrigins: readonly string[],
): void {
  const trimmed = successUrl?.trim();
  if (!trimmed) {
    if (autoRedirect !== undefined && autoRedirect !== null) {
      throw new BadRequestException(
        'autoRedirect só pode ser usado juntamente com successUrl.',
      );
    }
    return;
  }
  if (!successUrlAllowedByPublicOrigins(trimmed, allowedOrigins)) {
    throw new BadRequestException(
      'successUrl deve usar HTTPS (ou http em localhost) e o domínio deve estar nas origens públicas registadas para esta igreja.',
    );
  }
}
