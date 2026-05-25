import { existsSync } from 'fs';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

function resolveEnvFilePaths(): string[] | undefined {
  const candidates = [
    join(process.cwd(), '.env'),
    join(__dirname, '../../.env'),
    join(__dirname, '../../../.env'),
  ];
  const paths = candidates.filter(
    (p, i, arr) => existsSync(p) && arr.indexOf(p) === i,
  );
  return paths.length > 0 ? paths : undefined;
}

function validateEnv(env: Record<string, unknown>) {
  const key = env.ENCRYPTION_KEY as string | undefined;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
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
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      validate: validateEnv,
    }),
  ],
})
export class NestConfigModule {}
