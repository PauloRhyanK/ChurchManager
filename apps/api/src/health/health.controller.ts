import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

const SERVICE = 'church-manager-api';

/**
 * Tempo máximo da checagem do banco. Fica abaixo do `timeout: 5s` do
 * healthcheck do Docker (docker-compose.prod.yml) para a rota responder 503
 * antes de o Docker desistir da requisição.
 */
const DB_CHECK_TIMEOUT_MS = 2000;

/** `SELECT 1` com tempo limite; nunca lança, só diz se o banco respondeu. */
export async function checkDatabase(
  prisma: PrismaService,
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = prisma.$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rota pública de saúde (`/api/health`), usada pelo healthcheck do Docker e
 * pelo monitoramento externo (Uptime Kuma). Responde 200 `{"ok":true}` só se o
 * banco responde; senão 503 `{"ok":false}`, sem detalhes do erro.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    if (await checkDatabase(this.prisma, DB_CHECK_TIMEOUT_MS)) {
      return { ok: true, service: SERVICE, database: 'up' };
    }
    throw new ServiceUnavailableException({
      ok: false,
      service: SERVICE,
      database: 'down',
    });
  }
}
