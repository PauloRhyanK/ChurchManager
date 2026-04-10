import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FinancialModule } from './modules/financial/financial.module';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const key = env.ENCRYPTION_KEY as string | undefined;
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          throw new Error(
            'ENCRYPTION_KEY inválida ou ausente (esperado hex com 64 caracteres)',
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
    ]),
    PrismaModule,
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
