import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Mailer, EmailMessage } from '../mail/mailer';
import type { TenantPublicWebOriginService } from '../tenants/tenant-public-web-origin.service';
import { TicketDeliveryService } from './ticket-delivery.service';

const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function confirmedOrder(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: 'CONFIRMED',
    ticketsEmailSentAt: null,
    payer: { name: 'Maria', email: 'maria@exemplo.com' },
    tenant: { name: 'Igreja Exemplo', slug: 'igreja' },
    event: {
      title: 'Retiro',
      date: new Date(Date.UTC(2026, 6, 15)),
      timeStart: new Date(Date.UTC(1970, 0, 1, 19, 0, 0)),
      location: 'Templo',
    },
    tickets: [
      {
        publicCode: 'CODE1',
        holderName: 'Maria',
        createdAt: new Date(),
        ticketType: { name: 'Inteira' },
      },
    ],
    ...over,
  };
}

function harness(order: unknown, origins: string[] = ['https://igreja.exemplo']) {
  const sent: EmailMessage[] = [];
  const updates: unknown[] = [];
  const prisma = {
    eventOrder: {
      findUnique: async () => order,
      update: async (args: unknown) => {
        updates.push(args);
        return {};
      },
    },
  };
  const mailer = {
    send: async (m: EmailMessage) => {
      sent.push(m);
    },
  };
  const origem = {
    getAllowedOriginsForSlug: async () => origins,
  };
  const config = { get: () => undefined };
  const svc = new TicketDeliveryService(
    prisma as unknown as PrismaService,
    mailer as Mailer,
    origem as unknown as TenantPublicWebOriginService,
    config as unknown as ConfigService,
  );
  return { svc, sent, updates };
}

test('envia bilhetes e marca a entrega', async () => {
  const { svc, sent, updates } = harness(confirmedOrder());

  await svc.sendTicketsForOrder(ORDER_ID);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'maria@exemplo.com');
  assert.equal(sent[0].attachments?.length, 1);
  // QR real gerado pelo `qrcode` — assinatura PNG.
  assert.equal(
    sent[0].attachments![0].content.subarray(1, 4).toString(),
    'PNG',
  );
  assert.equal(updates.length, 1);
});

test('não reenvia quando ticketsEmailSentAt já está preenchido', async () => {
  const { svc, sent, updates } = harness(
    confirmedOrder({ ticketsEmailSentAt: new Date() }),
  );

  await svc.sendTicketsForOrder(ORDER_ID);

  assert.equal(sent.length, 0, 'webhook repetido não pode reenviar');
  assert.equal(updates.length, 0);
});

test('não envia para pedido que não está confirmado', async () => {
  const { svc, sent } = harness(confirmedOrder({ status: 'PENDING' }));

  await svc.sendTicketsForOrder(ORDER_ID);

  assert.equal(sent.length, 0);
});

test('sem e-mail do pagador não envia nem marca', async () => {
  const { svc, sent, updates } = harness(confirmedOrder({ payer: null }));

  await svc.sendTicketsForOrder(ORDER_ID);

  assert.equal(sent.length, 0);
  assert.equal(updates.length, 0, 'sem envio não pode marcar como entregue');
});

test('sem origem pública registada o link fica ausente', async () => {
  const { svc, sent } = harness(confirmedOrder(), []);

  await svc.sendTicketsForOrder(ORDER_ID);

  assert.doesNotMatch(sent[0].html, /Abrir bilhete no navegador/);
});

test('link do bilhete usa a primeira origem do tenant', async () => {
  const { svc, sent } = harness(confirmedOrder());

  await svc.sendTicketsForOrder(ORDER_ID);

  assert.match(sent[0].html, /https:\/\/igreja\.exemplo\/ingresso\/CODE1/);
});
