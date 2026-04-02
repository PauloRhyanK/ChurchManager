import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

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
    private readonly config: ConfigService,
  ) {}

  verifyToken(headerToken: string | undefined): void {
    const expected = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!expected) {
      throw new UnauthorizedException('Webhook não configurado');
    }
    if (headerToken !== expected) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async processRawBody(
    raw: unknown,
    idempotencyKeyFromHeader: string | undefined,
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
