import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Pede ao site público (Next.js) que invalide o cache de `site-content`
 * após uma edição no painel. Falhas são só logadas — não bloqueiam o save.
 */
@Injectable()
export class SiteRevalidationService {
  private readonly logger = new Logger(SiteRevalidationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  notifyContentChanged(tenantId: string): void {
    void this.run(tenantId);
  }

  private async run(tenantId: string): Promise<void> {
    const secret = this.config.get<string>('SITE_REVALIDATION_SECRET')?.trim();
    if (!secret) {
      return;
    }

    const rows = await this.prisma.tenantPublicWebOrigin.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { origin: true },
      take: 1,
    });
    const rawOrigin = rows[0]?.origin?.trim();
    if (!rawOrigin) {
      return;
    }

    const origin = rawOrigin.replace(/\/$/, '');
    const url = `${origin}/api/revalidate-site-content?secret=${encodeURIComponent(secret)}`;

    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        this.logger.warn(
          `Revalidação site-content falhou (${res.status}) para ${origin}`,
        );
        return;
      }
      this.logger.log(`Revalidação site-content solicitada (${origin})`);
    } catch (error) {
      this.logger.warn(`Revalidação site-content erro: ${error}`);
    }
  }
}
