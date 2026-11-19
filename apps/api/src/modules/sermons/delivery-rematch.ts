import type { Prisma } from '@prisma/client';
import { matchDeliveries } from './delivery-match';

const BY_TIME = [{ startTime: 'asc' }, { id: 'asc' }] as const;

/**
 * Reaplica o casamento por data e hora e grava só o que mudou. Usado pelo envio, pela palavra apagada
 * e pelo módulo de culto; lê só `worshipService` e `sermonDelivery`.
 */
export async function rematchDeliveries(tx: Prisma.TransactionClient, tenantId: string, dates: string[]): Promise<void> {
  for (const day of [...new Set(dates)]) {
    const date = new Date(`${day}T00:00:00.000Z`);
    const services = await tx.worshipService.findMany({ where: { tenantId, date }, orderBy: [...BY_TIME] });
    const deliveries = await tx.sermonDelivery.findMany({
      where: { tenantId, date },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const result = matchDeliveries(services, deliveries);
    const changed = deliveries.filter((x) => (result.get(x.id) ?? null) !== x.serviceId);
    // serviceId é único: libera primeiro, atribui depois, para a troca não colidir no meio.
    for (const x of changed) {
      if (x.serviceId !== null) await tx.sermonDelivery.update({ where: { id: x.id }, data: { serviceId: null } });
    }
    for (const x of changed) {
      const next = result.get(x.id) ?? null;
      if (next !== null) await tx.sermonDelivery.update({ where: { id: x.id }, data: { serviceId: next } });
    }
  }
}
