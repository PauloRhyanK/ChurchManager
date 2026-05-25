import { Module } from '@nestjs/common';
import { NestConfigModule } from '../config/nest-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScriptsFinancialModule } from './scripts-financial.module';

/** Contexto Nest mínimo para `scripts/*.ts` (sem JwtStrategy, guards, controllers). */
@Module({
  imports: [NestConfigModule, PrismaModule, ScriptsFinancialModule],
})
export class ScriptsAppModule {}
