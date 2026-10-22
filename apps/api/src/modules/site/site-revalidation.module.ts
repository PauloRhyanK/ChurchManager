import { Module } from '@nestjs/common';
import { SiteRevalidationService } from './site-revalidation.service';

/**
 * Módulo só do SiteRevalidationService (depende apenas de Config e Prisma,
 * globais), para o TenantsModule usá-lo sem ciclo com o SiteModule.
 */
@Module({
  providers: [SiteRevalidationService],
  exports: [SiteRevalidationService],
})
export class SiteRevalidationModule {}
