import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { originMatchesAllowlist } from '../modules/tenants/public-web-origin.util';
import { TenantPublicWebOriginService } from '../modules/tenants/tenant-public-web-origin.service';

function requestPath(req: Request): string {
  const fromOriginal = (req.originalUrl ?? req.url ?? '').split('?')[0];
  if (fromOriginal) {
    return fromOriginal;
  }
  const base = req.baseUrl ?? '';
  const p = req.path ?? '';
  return `${base}${p}`.split('?')[0] || '';
}

/** Remove barra final para comparação estável (ex.: .env com trailing slash). */
export function normalizeOrigin(origin: string): string {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

/**
 * Origin explícito do browser ou derivado do Referer (proxies às vezes removem Origin).
 */
export function requestOrigin(req: Request): string | undefined {
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.length > 0) {
    return originHeader;
  }
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Extrai o slug do tenant. O prefixo global `api` **não** se aplica ao middleware Nest
 * (`/public/tenants/:slug/...`); mantemos também `/api/public/...` por segurança.
 */
export function extractPublicTenantSlug(path: string): string | null {
  const withApi = path.match(/^\/api\/public\/tenants\/([^/]+)(\/|$)/);
  if (withApi?.[1]) return decodeURIComponent(withApi[1]);
  const noApi = path.match(/^\/public\/tenants\/([^/]+)(\/|$)/);
  if (noApi?.[1]) return decodeURIComponent(noApi[1]);
  return null;
}

@Injectable()
export class DynamicCorsMiddleware implements NestMiddleware {
  constructor(
    private readonly config: ConfigService,
    private readonly publicWebOrigins: TenantPublicWebOriginService,
  ) {}

  private adminOriginsFromEnv(): string[] {
    const raw = this.config.get<string>('ADMIN_CORS_ORIGIN') ?? '';
    return raw
      .split(',')
      .map((o) => normalizeOrigin(o.trim()))
      .filter(Boolean);
  }

  private adminOriginAllowed(origin: string): boolean {
    const normalized = normalizeOrigin(origin);
    return this.adminOriginsFromEnv().includes(normalized);
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = requestPath(req);
    const origin = requestOrigin(req);

    const adminFamily =
      path.startsWith('/api/auth') ||
      path.startsWith('/auth') ||
      path.startsWith('/api/admin') ||
      path.startsWith('/admin') ||
      path === '/api/health' ||
      path === '/health';

    const publicSlug = extractPublicTenantSlug(path);

    let reflect: string | undefined;
    if (origin) {
      if (adminFamily && this.adminOriginAllowed(origin)) {
        reflect = normalizeOrigin(origin);
      } else if (publicSlug) {
        const allowed =
          await this.publicWebOrigins.getAllowedOriginsForSlug(publicSlug);
        if (originMatchesAllowlist(origin, allowed)) {
          reflect = origin;
        }
      }
    }

    if (reflect) {
      res.setHeader('Access-Control-Allow-Origin', reflect);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      if (adminFamily || publicSlug) {
        if (reflect) {
          res.setHeader(
            'Access-Control-Allow-Methods',
            'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
          );
          res.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization',
          );
        }
        res.status(204).end();
        return;
      }
    }

    next();
  }
}
