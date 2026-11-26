import { createHash, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { buildHealthReport } from './health-report';
import { PrismaHealthProbe, type HealthProbe } from './health.probe';

/**
 * Prazo de cada consulta ao banco. Fica abaixo do `timeout: 5s` do
 * healthcheck do Docker (docker-compose.prod.yml), para a rota responder 503
 * antes de o Docker desistir da requisição.
 */
const DB_TIMEOUT_MS = 2000;
/** SELECT 1 acima disto vira warn. */
const DB_SLOW_MS = 500;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Compara o Bearer com HEALTH_TOKEN; sem HEALTH_TOKEN definido, nunca libera. */
function hasHealthToken(authorization: string | undefined): boolean {
  const expected = process.env.HEALTH_TOKEN?.trim();
  if (!expected || !authorization) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (!match) return false;
  return timingSafeEqual(sha256(match[1]), sha256(expected));
}

/**
 * Rota pública de saúde (`/api/health`), usada pelo healthcheck do Docker e
 * pelo Uptime Kuma. Formato application/health+json: 200 para pass/warn, 503
 * para fail. Sem o token só sai `status` e `time`; com
 * `Authorization: Bearer <HEALTH_TOKEN>` saem também os checks.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(PrismaHealthProbe) private readonly probe: HealthProbe) {}

  @Get()
  async getHealth(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { httpStatus, body } = await buildHealthReport(this.probe, {
      detailed: hasHealthToken(authorization),
      timeoutMs: DB_TIMEOUT_MS,
      slowMs: DB_SLOW_MS,
      releaseId: process.env.RELEASE_ID?.trim() || undefined,
    });
    res
      .status(httpStatus)
      .setHeader('Content-Type', 'application/health+json; charset=utf-8')
      .setHeader('Cache-Control', 'no-store')
      .send(JSON.stringify(body));
  }
}
