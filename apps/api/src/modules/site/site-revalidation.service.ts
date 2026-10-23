import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatFetchError,
  parseRevalidationTargets,
} from './site-revalidation.util';

const REVALIDATE_PATH = '/api/revalidate-site-content';
const REVALIDATE_TIMEOUT_MS = 5_000;

/**
 * Pede ao site público (Next.js) que invalide o cache de `site-content`
 * após uma edição no painel. Os destinos vêm de SITE_REVALIDATION_TARGETS
 * (configuração da plataforma), nunca das origens CORS do tenant.
 * Nunca rejeita nem lança: falhas são só logadas.
 */
@Injectable()
export class SiteRevalidationService {
  private readonly logger = new Logger(SiteRevalidationService.name);
  private targets: Map<string, string[]> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.loadTargets();
  }

  /**
   * Origens do site configuradas para o tenant em SITE_REVALIDATION_TARGETS
   * (as que recebem a revalidação); lista vazia se não houver.
   */
  originsForTenantSlug(slug: string): readonly string[] {
    return this.targets?.get(slug) ?? [];
  }

  notifyContentChanged(tenantId: string): void {
    void this.run(tenantId).catch((error) => {
      this.logger.warn(`Revalidação site-content erro: ${formatFetchError(error)}`);
    });
  }

  private loadTargets(): void {
    try {
      const raw = this.config.get<string>('SITE_REVALIDATION_TARGETS')?.trim();
      if (!raw) {
        return;
      }
      const production = this.config.get<string>('NODE_ENV') === 'production';
      const { byTenant, rejected } = parseRevalidationTargets(raw, production);
      for (const slug of rejected) {
        this.logger.warn(
          `SITE_REVALIDATION_TARGETS: destino inválido ou não permitido ignorado (tenant ${slug})`,
        );
      }
      this.targets = byTenant;
    } catch (error) {
      this.targets = null;
      this.logger.error(
        `SITE_REVALIDATION_TARGETS inválido; revalidação desativada (${formatFetchError(error)})`,
      );
    }
  }

  private async run(tenantId: string): Promise<void> {
    try {
      const secret = this.config
        .get<string>('SITE_REVALIDATION_SECRET')
        ?.trim();
      if (!secret || !this.targets) {
        return;
      }

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      const origins = tenant ? this.originsForTenantSlug(tenant.slug) : [];
      if (!tenant || !origins.length) {
        this.logger.log(
          `Revalidação site-content: tenant ${tenant?.slug ?? tenantId} sem destino configurado`,
        );
        return;
      }

      await Promise.all(
        origins.map((origin) => this.notifyOrigin(origin, secret)),
      );
    } catch (error) {
      this.logger.warn(
        `Revalidação site-content erro: ${formatFetchError(error)}`,
      );
    }
  }

  private async notifyOrigin(origin: string, secret: string): Promise<void> {
    try {
      const res = await fetch(`${origin}${REVALIDATE_PATH}`, {
        method: 'GET',
        headers: { 'x-revalidation-secret': secret },
        redirect: 'manual',
        signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(
          `Revalidação site-content falhou (${res.status}) para ${origin}`,
        );
        return;
      }
      this.logger.log(
        `Revalidação site-content solicitada (${origin}, ${res.status})`,
      );
    } catch (error) {
      this.logger.warn(
        `Revalidação site-content erro para ${origin}: ${formatFetchError(error)}`,
      );
    }
  }
}
