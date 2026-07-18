import { toBuffer } from 'qrcode';

/**
 * Gera o QR code de um bilhete em PNG.
 *
 * O payload é o `publicCode` do bilhete — o mesmo valor que o check-in resolve
 * (ver `ticketMatch`). Nível de correcção `M` (~15%) porque o código é curto e
 * o QR é lido de ecrã ou papel à porta do evento.
 */
export function renderTicketQrPng(publicCode: string): Promise<Buffer> {
  return toBuffer(publicCode, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
}

/** Content-ID do QR embutido no e-mail (referenciado por `cid:` no HTML). */
export function ticketQrContentId(publicCode: string): string {
  return `qr-${publicCode}`;
}
