import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantCredentialsService } from '../tenants/tenant-credentials.service';

/** Payload mínimo esperado dos webhooks Asaas v3 */
interface AsaasWebhookBody {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    customer?: string;
  };
}

@Injectable()
export class AsaasWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCredentials: TenantCredentialsService,
  ) {}

  verifyToken(
    headerToken: string | undefined,
    encryptedToken: string | null,
  ): void {
    if (!encryptedToken) {
      throw new UnauthorizedException('Webhook não configurado');
    }
    const expected = this.tenantCredentials.getDecryptedWebhookToken(
      encryptedToken,
    );
    if (headerToken !== expected) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async processRawBody(
    raw: unknown,
    idempotencyKeyFromHeader: string | undefined,
    tenantId: string,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const body = raw as AsaasWebhookBody;
    const paymentId = body.payment?.id;
    const event = body.event ?? 'UNKNOWN';

    if (!paymentId) {
      throw new BadRequestException('Payload sem payment.id');
    }

    const idempotencyKey =
      idempotencyKeyFromHeader?.trim() ||
      `${event}:${paymentId}`;

    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.financialWebhookEvent.createMany({
        data: [
          {
            tenantId,
            idempotencyKey,
            eventType: event,
            paymentId,
            payload: raw as object,
          },
        ],
        skipDuplicates: true,
      });

      if (inserted.count === 0) {
        return { ok: true, duplicate: true };
      }

      const status =
        event === 'PAYMENT_RECEIVED' ||
        event === 'PAYMENT_CONFIRMED' ||
        body.payment?.status === 'RECEIVED' ||
        body.payment?.status === 'CONFIRMED'
          ? 'CONFIRMED'
          : undefined;

      if (status) {
        await tx.financialTransaction.updateMany({
          where: { asaasPaymentId: paymentId },
          data: { status },
        });
      }

      return { ok: true, duplicate: false };
    });
  }
}
