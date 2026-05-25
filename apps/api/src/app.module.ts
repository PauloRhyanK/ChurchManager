import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { NestConfigModule } from './config/nest-config.module';
import { DynamicCorsMiddleware } from './common/dynamic-cors.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FinancialModule } from './modules/financial/financial.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './health/health.module';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';

@Module({
  imports: [
    NestConfigModule,
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
      {
        name: 'platform',
        ttl: 60_000,
        limit: 10,
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
    DynamicCorsMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DynamicCorsMiddleware).forRoutes('*');
  }
}
