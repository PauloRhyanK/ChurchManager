import { performance } from 'node:perf_hooks';
import type { BusinessCounts, HealthProbe } from './health.probe';

/**
 * Resposta no formato do rascunho IETF "Health Check Response Format for HTTP
 * APIs" (draft-inadarei-api-health-check), servida como application/health+json.
 */
export type HealthStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheck {
  componentType: 'datastore' | 'component' | 'system';
  observedValue?: number;
  observedUnit: string;
  status: HealthStatus;
  time: string;
  [extra: string]: unknown;
}

export interface HealthBody {
  status: HealthStatus;
  time: string;
  serviceId?: string;
  releaseId?: string;
  uptime?: number;
  checks?: Record<string, HealthCheck[]>;
}

export interface HealthReportOptions {
  /** Inclui serviceId, releaseId, uptime e checks (só com o token). */
  detailed: boolean;
  /** Prazo de cada consulta ao banco. */
  timeoutMs: number;
  /** Acima disto o SELECT 1 vira warn. */
  slowMs: number;
  releaseId?: string;
}

export const SERVICE_ID = 'church-manager-api';
/** Fração de max_connections a partir da qual as conexões viram warn. */
const CONNECTIONS_WARN_RATIO = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;

class TimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve para o valor ou `undefined`; erros nunca saem daqui (nem a mensagem). */
async function attempt<T>(fn: () => Promise<T>, ms: number): Promise<T | undefined> {
  try {
    return await withTimeout(fn(), ms);
  } catch {
    return undefined;
  }
}

function worst(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

const BUSINESS: Array<[string, keyof BusinessCounts, string]> = [
  ['tenants:count', 'tenants', 'tenants'],
  ['users:active', 'activeAdminUsers', 'users'],
  ['eventRegistrations:last24h', 'eventRegistrationsLast24h', 'registrations'],
  ['financialTransactions:last24h', 'financialTransactionsLast24h', 'transactions'],
];

export async function buildHealthReport(
  probe: HealthProbe,
  opts: HealthReportOptions,
): Promise<{ httpStatus: number; body: HealthBody }> {
  const time = () => new Date().toISOString();
  const checks: Record<string, HealthCheck[]> = {};

  const started = performance.now();
  const pingOk = (await attempt(() => probe.ping().then(() => true), opts.timeoutMs)) === true;
  const elapsedMs = Math.round(performance.now() - started);

  checks['postgres:responseTime'] = [
    {
      componentType: 'datastore',
      ...(pingOk ? { observedValue: elapsedMs } : {}),
      observedUnit: 'ms',
      status: !pingOk ? 'fail' : elapsedMs > opts.slowMs ? 'warn' : 'pass',
      time: time(),
    },
  ];

  if (pingOk) {
    const since = new Date(Date.now() - DAY_MS);
    const [conn, size, counts] = await Promise.all([
      attempt(() => probe.connections(), opts.timeoutMs),
      opts.detailed ? attempt(() => probe.databaseSize(), opts.timeoutMs) : undefined,
      opts.detailed ? attempt(() => probe.businessCounts(since), opts.timeoutMs) : undefined,
    ]);

    const ratio = conn && conn.max > 0 ? conn.total / conn.max : undefined;
    checks['postgres:connections'] = [
      {
        componentType: 'datastore',
        ...(conn ? { observedValue: conn.total, active: conn.active, idle: conn.idle, max: conn.max } : {}),
        observedUnit: 'connections',
        status: ratio === undefined || ratio > CONNECTIONS_WARN_RATIO ? 'warn' : 'pass',
        time: time(),
      },
    ];

    if (opts.detailed) {
      checks['postgres:size'] = [
        {
          componentType: 'datastore',
          ...(size !== undefined ? { observedValue: size } : {}),
          observedUnit: 'bytes',
          status: size !== undefined ? 'pass' : 'warn',
          time: time(),
        },
      ];
      for (const [name, key, unit] of BUSINESS) {
        checks[name] = [
          {
            componentType: 'component',
            ...(counts ? { observedValue: counts[key] } : {}),
            observedUnit: unit,
            status: counts ? 'pass' : 'warn',
            time: time(),
          },
        ];
      }
    }
  }

  const status = worst(Object.values(checks).map(([c]) => c.status));
  const httpStatus = status === 'fail' ? 503 : 200;

  if (!opts.detailed) {
    return { httpStatus, body: { status, time: time() } };
  }

  const mem = process.memoryUsage();
  checks['memory:rss'] = [
    { componentType: 'system', observedValue: mem.rss, observedUnit: 'bytes', status: 'pass', time: time() },
  ];
  checks['memory:heapUsed'] = [
    {
      componentType: 'system',
      observedValue: mem.heapUsed,
      observedUnit: 'bytes',
      heapTotal: mem.heapTotal,
      status: 'pass',
      time: time(),
    },
  ];

  return {
    httpStatus,
    body: {
      status,
      serviceId: SERVICE_ID,
      ...(opts.releaseId ? { releaseId: opts.releaseId } : {}),
      time: time(),
      uptime: Math.round(process.uptime()),
      checks,
    },
  };
}
