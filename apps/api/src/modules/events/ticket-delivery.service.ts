import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Mailer } from '../mail/mailer';
import { TenantPublicWebOriginService } from '../tenants/tenant-public-web-origin.service';
import { formatDateOnly, formatEventDateTimePtBr, formatTimeOnly } from './event-format.util';
import { renderTicketQrPng } from './ticket-qr';
import { buildTicketsEmail, TicketEmailTicket } from './tickets.email';

const DEFAULT_TICKET_PATH = '/ingresso/{code}';

@Injectable()
export class TicketDeliveryService {
  private readonly logger = new Logger(TicketDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly publicWebOrigins: TenantPublicWebOriginService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Envia os bilhetes de um pedido confirmado ao pagador.
   *
   * Chamado **depois** da transacção que emite os bilhetes: um rollback nunca
   * pode deixar um e-mail de confirmação enviado. Idempotente via
   * `ticketsEmailSentAt`, porque o webhook Asaas repete entregas.
   */
  async sendTicketsForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.eventOrder.findUnique({
      where: { id: orderId },
      include: {
        payer: { select: { name: true, email: true } },
        tenant: { select: { name: true, slug: true } },
        event: { select: { title: true, date: true, timeStart: true, location: true } },
        tickets: {
          orderBy: { createdAt: 'asc' },
          include: { ticketType: { select: { name: true } } },
        },
      },
    });

    if (!order || order.status !== 'CONFIRMED') return;
    if (order.ticketsEmailSentAt) return;
    if (!order.tickets.length) return;

    const email = order.payer?.email?.trim();
    if (!email) {
      this.logger.warn(
        `Pedido ${orderId} confirmado sem e-mail do pagador; bilhetes não enviados`,
      );
      return;
    }

    const baseUrl = await this.resolveTicketBaseUrl(order.tenant.slug);
    const tickets: TicketEmailTicket[] = await Promise.all(
      order.tickets.map(async (t) => ({
        publicCode: t.publicCode,
        holderName: t.holderName,
        ticketTypeName: t.ticketType.name,
        qrPng: await renderTicketQrPng(t.publicCode),
        url: baseUrl ? baseUrl.replace('{code}', encodeURIComponent(t.publicCode)) : null,
      })),
    );

    const message = buildTicketsEmail({
      to: email,
      payerName: order.payer?.name ?? '',
      churchName: order.tenant.name,
      eventTitle: order.event.title,
      eventDateLabel: formatEventDateTimePtBr(
        formatDateOnly(order.event.date),
        formatTimeOnly(order.event.timeStart),
      ),
      eventLocation: order.event.location,
      tickets,
    });

    await this.mailer.send(message);

    await this.prisma.eventOrder.update({
      where: { id: orderId },
      data: { ticketsEmailSentAt: new Date() },
    });
    this.logger.log(
      `Bilhetes do pedido ${orderId} enviados para ${email} (${tickets.length})`,
    );
  }

  /**
   * Base do link público do bilhete: primeira origem registada do tenant +
   * caminho configurável. Sem origem registada, o e-mail sai apenas com o QR
   * e o código.
   */
  private async resolveTicketBaseUrl(slug: string): Promise<string | null> {
    const origins = await this.publicWebOrigins.getAllowedOriginsForSlug(slug);
    const origin = origins[0];
    if (!origin) return null;
    const path =
      this.config.get<string>('EVENT_TICKET_PUBLIC_PATH')?.trim() ||
      DEFAULT_TICKET_PATH;
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
