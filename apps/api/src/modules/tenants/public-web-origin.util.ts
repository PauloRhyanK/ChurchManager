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
