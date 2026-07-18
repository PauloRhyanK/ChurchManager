import { EmailAttachment, EmailMessage } from '../mail/mailer';
import { escapeHtml } from '../mail/html';
import { ticketQrContentId } from './ticket-qr';

export type TicketEmailTicket = {
  publicCode: string;
  holderName: string;
  ticketTypeName: string;
  /** PNG do QR já gerado; embutido como anexo inline e ficheiro descarregável. */
  qrPng: Buffer;
  /** Página pública do bilhete, quando o tenant tem origem registada. */
  url: string | null;
};

export type TicketEmailInput = {
  to: string;
  payerName: string;
  churchName: string;
  eventTitle: string;
  /** Já formatada para leitura (ver `formatEventDateTimePtBr`). */
  eventDateLabel: string;
  eventLocation: string | null;
  tickets: TicketEmailTicket[];
};

function ticketBlock(ticket: TicketEmailTicket): string {
  const cid = ticketQrContentId(ticket.publicCode);
  const holder = escapeHtml(ticket.holderName);
  const typeName = escapeHtml(ticket.ticketTypeName);
  const code = escapeHtml(ticket.publicCode);
  const link = ticket.url
    ? `<p style="margin: 12px 0 0;">
         <a href="${escapeHtml(ticket.url)}" style="color: #4f46e5; font-size: 13px;">Abrir bilhete no navegador</a>
       </p>`
    : '';

  return `
  <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 0 0 16px; text-align: center;">
    <p style="font-size: 15px; font-weight: 600; margin: 0 0 4px; color: #111827;">${holder}</p>
    <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px;">${typeName}</p>
    <img src="cid:${cid}" alt="QR code do bilhete" width="220" height="220" style="display: block; margin: 0 auto; width: 220px; height: 220px;" />
    <p style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; letter-spacing: 1px; color: #374151; margin: 16px 0 0;">${code}</p>
    ${link}
  </div>`;
}

/**
 * E-mail de entrega de bilhetes após confirmação do pagamento.
 *
 * Função pura: recebe os dados do domínio (incluindo os PNG já gerados) e
 * devolve a mensagem pronta. Não conhece o provedor de envio nem a base de
 * dados.
 */
export function buildTicketsEmail(input: TicketEmailInput): EmailMessage {
  const churchName = escapeHtml(input.churchName);
  const eventTitle = escapeHtml(input.eventTitle);
  const dateLabel = escapeHtml(input.eventDateLabel);
  const greeting = input.payerName.trim()
    ? `Olá, ${escapeHtml(input.payerName.trim())}`
    : 'Olá';
  const plural = input.tickets.length > 1;

  const subject = `${plural ? 'Seus ingressos' : 'Seu ingresso'} — ${input.eventTitle}`;

  const locationLine = input.eventLocation
    ? `<p style="font-size: 15px; line-height: 1.6; margin: 0 0 4px; color: #374151;">${escapeHtml(input.eventLocation)}</p>`
    : '';

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #111827;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">Pagamento confirmado</h1>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${greeting},</p>

    <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
      <p style="font-size: 17px; font-weight: 600; margin: 0 0 8px;">${eventTitle}</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 4px; color: #374151;">${dateLabel}</p>
      ${locationLine}
    </div>

    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
      ${plural ? 'Apresente os QR codes abaixo na entrada' : 'Apresente o QR code abaixo na entrada'}.
      ${plural ? 'Cada QR vale por uma pessoa.' : ''}
    </p>

    ${input.tickets.map(ticketBlock).join('\n')}

    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 24px 0 0;">
      ${plural ? 'Os QR codes também seguem em anexo' : 'O QR code também segue em anexo'},
      para o caso de as imagens não aparecerem no seu e-mail.
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 8px 0 0;">
      ${churchName}
    </p>
  </div>`.trim();

  const text = [
    `${greeting},`,
    '',
    `Pagamento confirmado para ${input.eventTitle}.`,
    input.eventDateLabel,
    ...(input.eventLocation ? [input.eventLocation] : []),
    '',
    plural
      ? 'Apresente os códigos abaixo na entrada (cada um vale por uma pessoa):'
      : 'Apresente o código abaixo na entrada:',
    '',
    ...input.tickets.flatMap((t) => [
      `${t.holderName} — ${t.ticketTypeName}`,
      `Código: ${t.publicCode}`,
      ...(t.url ? [t.url] : []),
      '',
    ]),
    plural
      ? 'Os QR codes seguem em anexo.'
      : 'O QR code segue em anexo.',
    input.churchName,
  ].join('\n');

  const attachments: EmailAttachment[] = input.tickets.map((t, i) => ({
    filename: `ingresso-${i + 1}-${t.publicCode}.png`,
    content: t.qrPng,
    contentType: 'image/png',
    contentId: ticketQrContentId(t.publicCode),
  }));

  return { to: input.to, subject, html, text, attachments };
}
