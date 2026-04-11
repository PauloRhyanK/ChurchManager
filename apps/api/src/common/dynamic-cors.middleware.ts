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
      .map((o) => o.trim())
      .filter(Boolean);
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = requestPath(req);
    const originHeader = req.headers.origin;
    const origin =
      typeof originHeader === 'string' && originHeader.length > 0
        ? originHeader
        : undefined;

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
      if (adminFamily && this.adminOriginsFromEnv().includes(origin)) {
        reflect = origin;
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
