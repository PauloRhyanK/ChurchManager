import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PasswordResetService } from './password-reset.service';
import { PublicPasswordResetController } from './public-password-reset.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET não configurada');
        }
        const expiresIn =
          config.get<string>('JWT_EXPIRES_IN')?.trim() || '7d';
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as NonNullable<
              import('jsonwebtoken').SignOptions['expiresIn']
            >,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, PublicPasswordResetController],
  providers: [AuthService, JwtStrategy, PlatformAdminGuard, PasswordResetService],
  exports: [AuthService, JwtModule, PassportModule, PlatformAdminGuard],
})
export class AuthModule {}
