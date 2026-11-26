import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ConnectionStats {
  active: number;
  idle: number;
  total: number;
  max: number;
}

export interface BusinessCounts {
  tenants: number;
  activeAdminUsers: number;
  eventRegistrationsLast24h: number;
  financialTransactionsLast24h: number;
}

/** Consultas da rota de saúde. Separadas para os testes rodarem sem banco. */
export interface HealthProbe {
  ping(): Promise<void>;
  connections(): Promise<ConnectionStats>;
  databaseSize(): Promise<number>;
  businessCounts(since: Date): Promise<BusinessCounts>;
}

@Injectable()
export class PrismaHealthProbe implements HealthProbe {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async connections(): Promise<ConnectionStats> {
    const [row] = await this.prisma.$queryRaw<ConnectionStats[]>`
      SELECT
        count(*) FILTER (WHERE state = 'active')::int AS active,
        count(*) FILTER (WHERE state LIKE 'idle%')::int AS idle,
        count(*)::int AS total,
        current_setting('max_connections')::int AS max
      FROM pg_stat_activity
      WHERE backend_type = 'client backend'`;
    return row;
  }

  async databaseSize(): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ size: bigint }[]>`
      SELECT pg_database_size(current_database()) AS size`;
    return Number(row.size);
  }

  async businessCounts(since: Date): Promise<BusinessCounts> {
    const [tenants, activeAdminUsers, eventRegistrationsLast24h, financialTransactionsLast24h] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.adminUser.count({ where: { status: 'ACTIVE' } }),
        this.prisma.eventRegistration.count({ where: { createdAt: { gte: since } } }),
        this.prisma.financialTransaction.count({ where: { createdAt: { gte: since } } }),
      ]);
    return { tenants, activeAdminUsers, eventRegistrationsLast24h, financialTransactionsLast24h };
  }
}
