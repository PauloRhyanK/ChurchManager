import assert from 'node:assert/strict';
import test from 'node:test';
import type { EmailAttachment } from '../mail/mailer';
import { buildTicketsEmail, TicketEmailTicket } from './tickets.email';

const PNG = Buffer.from('fake-png');

function ticket(over: Partial<TicketEmailTicket> = {}): TicketEmailTicket {
  return {
    publicCode: 'AbC123xyz',
    holderName: 'Maria Silva',
    ticketTypeName: 'Inteira',
    qrPng: PNG,
    url: 'https://igreja.exemplo/ingresso/AbC123xyz',
    ...over,
  };
}

function build(tickets: TicketEmailTicket[]) {
  return buildTicketsEmail({
    to: 'maria@exemplo.com',
    payerName: 'Maria Silva',
    churchName: 'Igreja Exemplo',
    eventTitle: 'Retiro de Jovens',
    eventDateLabel: '15 de julho de 2026, 19:00',
    eventLocation: 'Templo principal',
    tickets,
  });
}

test('cada bilhete gera um anexo inline referenciado por cid no HTML', () => {
  const msg = build([ticket(), ticket({ publicCode: 'ZZZ999', holderName: 'João' })]);

  assert.equal(msg.attachments?.length, 2);
  for (const code of ['AbC123xyz', 'ZZZ999']) {
    const att: EmailAttachment | undefined = msg.attachments?.find(
      (a) => a.contentId === `qr-${code}`,
    );
    assert.ok(att, `anexo em falta para ${code}`);
    assert.equal(att?.contentType, 'image/png');
    // O cid do anexo tem de existir no HTML, senão o cliente não mostra nada.
    assert.match(msg.html, new RegExp(`src="cid:qr-${code}"`));
  }
});

test('escapa dados de origem pública no HTML', () => {
  const msg = build([ticket({ holderName: '<script>alert(1)</script>' })]);

  assert.doesNotMatch(msg.html, /<script>/);
  assert.match(msg.html, /&lt;script&gt;/);
});

test('assunto e corpo acompanham a quantidade de bilhetes', () => {
  const um = build([ticket()]);
  const dois = build([ticket(), ticket({ publicCode: 'B2' })]);

  assert.match(um.subject, /^Seu ingresso —/);
  assert.match(dois.subject, /^Seus ingressos —/);
  assert.match(um.text!, /Apresente o código abaixo/);
  assert.match(dois.text!, /cada um vale por uma pessoa/);
});

test('sem URL pública o bilhete sai só com QR e código', () => {
  const msg = build([ticket({ url: null })]);

  assert.doesNotMatch(msg.html, /Abrir bilhete no navegador/);
  assert.match(msg.html, /AbC123xyz/);
  assert.match(msg.text!, /Código: AbC123xyz/);
});
