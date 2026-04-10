import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FinancialModule } from './modules/financial/financial.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './health/health.module';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const key = env.ENCRYPTION_KEY as string | undefined;
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          // Falha no arranque (equivalente a process.exit): o processo Nest não sobe.
          throw new Error(
            'ENCRYPTION_KEY inválida ou ausente (esperado hex com 64 caracteres)',
          );
        }
        const jwt = env.JWT_SECRET as string | undefined;
        if (!jwt || jwt.length < 32) {
          throw new Error(
            'JWT_SECRET ausente ou fraca (mínimo 32 caracteres recomendado)',
          );
        }
        return env;
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'public',
        ttl: 60_000,
        limit: 30,
      },
      {
        name: 'links',
        ttl: 60_000,
        limit: 5,
      },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    FinancialModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}
