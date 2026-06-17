# Contrato público — Eventos e ingressos (alvo / evolução)

> **Para integrar o site hoje**, use a referência alinhada ao código implementado:
> **[events-api-reference.md](./events-api-reference.md)** (tipos TypeScript, exemplos, fluxos e erros reais).

Escopo: utilizador anónimo ou sessão site (sem JWT administrativo), tenant resolvido por **`slug`**.

**Estado:** a maior parte destes endpoints está **implementada**; alguns campos de resposta abaixo descrevem o **contrato-alvo** (ex.: `startsAt`, paginação cursor). A tabela de mapeamento implementação ↔ alvo está em [events-api-reference.md §13](./events-api-reference.md#13-notas-de-implementação-no-front).

---

## 1. Listar eventos

**Planeado:** `GET /api/public/tenants/:slug/events`

### Query (opcional)

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `status` | string | Ex.: `PUBLISHED`, `DRAFT` (público deve filtrar só publicados; parâmetro reservado para consistência) |
| `from` | string (ISO date) | Eventos com data de início ≥ `from` |
| `to` | string (ISO date) | Eventos com data de início ≤ `to` |
| `cursor` | string | Paginação por cursor (opaque) |
| `limit` | number | Default sugerido: `20`, máximo: `50` |

### Resposta `200`

```json
{
  "items": [
    {
      "id": "uuid",
      "slug": "string-opcional-para-url-amigavel",
      "title": "string",
      "shortDescription": "string | null",
      "startsAt": "2026-05-01T19:00:00.000Z",
      "endsAt": "2026-05-01T22:00:00.000Z",
      "timezone": "America/Sao_Paulo",
      "venueName": "string | null",
      "venueAddressSummary": "string | null",
      "coverImageUrl": "https://... | null",
      "isRegistrationOpen": true,
      "minPriceCents": 0,
      "currency": "BRL"
    }
  ],
  "nextCursor": "string | null"
}
```

### Erros

| Código | Quando |
|--------|--------|
| `404` | `slug` de tenant inexistente |

---

## 2. Detalhe do evento

**Planeado:** `GET /api/public/tenants/:slug/events/:eventId`

`eventId` — UUID do evento (preferido). Se existir `slug` por evento, pode documentar-se alias `GET .../events/by-slug/:eventSlug` numa fase posterior.

### Resposta `200`

Corpo alinhado ao item da listagem, com campos extra opcionais:

```json
{
  "id": "uuid",
  "slug": "string | null",
  "title": "string",
  "descriptionHtml": "string | null",
  "shortDescription": "string | null",
  "startsAt": "2026-05-01T19:00:00.000Z",
  "endsAt": "2026-05-01T22:00:00.000Z",
  "timezone": "America/Sao_Paulo",
  "venueName": "string | null",
  "venueAddress": "string | null",
  "coverImageUrl": "https://... | null",
  "isRegistrationOpen": true,
  "registrationClosesAt": "2026-04-30T23:59:59.000Z | null",
  "currency": "BRL",
  "termsUrl": "https://... | null"
}
```

### Erros

| Código | Quando |
|--------|--------|
| `404` | Evento inexistente, rascunho, ou não pertence ao tenant |

---

## 3. Tipos de ingresso / disponibilidade

**Planeado:** `GET /api/public/tenants/:slug/events/:eventId/tickets`

Lista **tipos de bilhete** (lotes), preços e regras para o checkout.

### Resposta `200`

```json
{
  "eventId": "uuid",
  "currency": "BRL",
  "ticketTypes": [
    {
      "id": "uuid",
      "name": "Ingresso inteira",
      "description": "string | null",
      "priceCents": 5000,
      "feeCents": 0,
      "quantityTotal": 200,
      "quantityRemaining": 42,
      "minPerOrder": 1,
      "maxPerOrder": 10,
      "salesOpensAt": "2026-04-01T00:00:00.000Z | null",
      "salesClosesAt": "2026-04-30T23:59:59.000Z | null",
      "isSoldOut": false
    }
  ]
}
```

### Erros

| Código | Quando |
|--------|--------|
| `404` | Evento inexistente ou inacessível |

---

## 4. Iniciar pagamento (checkout de ingressos)

**Planeado:** `POST /api/public/tenants/:slug/events/:eventId/checkout`

Cria intenção de compra, linhas por tipo de ingresso e **cobrança Asaas** no backend (o frontend nunca usa API key Asaas).

### Corpo

```json
{
  "payer": {
    "cpf": "00000000000",
    "name": "Nome Completo",
    "email": "a@b.com",
    "phone": "+5511999999999"
  },
  "lines": [
    { "ticketTypeId": "uuid", "quantity": 2 }
  ],
  "billingType": "PIX",
  "idempotencyKey": "opcional-string-unica-por-sessao"
}
```

`billingType`: `PIX` \| `BOLETO` \| `UNDEFINED` (mesma semântica que [create-payment-intent.dto.ts](../../apps/api/src/modules/financial/dto/create-payment-intent.dto.ts)).

### Resposta `201`

Alinhada à resposta de intenção de pagamento + contexto do evento:

```json
{
  "orderId": "uuid",
  "eventId": "uuid",
  "transactionId": "uuid",
  "asaasPaymentId": "string",
  "status": "PENDING",
  "billingType": "PIX",
  "value": 100.0,
  "dueDate": "2026-04-11",
  "invoiceUrl": "https://...",
  "bankSlipUrl": "https://... | null",
  "pix": {
    "encodedImage": "base64 | null",
    "payload": "string | null",
    "expirationDate": "string | null"
  } | null
}
```

### Erros

| Código | Quando |
|--------|--------|
| `400` | Quantidades inválidas, tipo esgotado, fora da janela de venda |
| `404` | Evento ou tipos inexistentes |
| `409` | Conflito de stock (race); cliente pode refetch `/tickets` e tentar de novo |

---

## 5. Estado do pagamento (polling)

**Planeado:** `GET /api/public/tenants/:slug/events/:eventId/orders/:orderId/payment`

Ou, de forma genérica (partilhado com cotas): `GET /api/public/tenants/:slug/payments/:transactionId` — a equipa deve escolher **um** padrão e manter consistência.

### Resposta `200`

```json
{
  "transactionId": "uuid",
  "orderId": "uuid",
  "status": "PENDING | CONFIRMED | FAILED | EXPIRED",
  "asaasPaymentId": "string",
  "value": 100.0,
  "currency": "BRL",
  "confirmedAt": "2026-04-10T15:00:00.000Z | null"
}
```

`CONFIRMED` deve refletir processamento idempotente via webhook Asaas (ver [financial-schema-and-webhooks.md](../financial-schema-and-webhooks.md)).

### Erros

| Código | Quando |
|--------|--------|
| `404` | Pedido ou transacção inexistente / outro tenant |

---

## 6. Pagamento concluído (UX + API)

### 6.1 Página de retorno no frontend

Após redireccionamento do checkout Asaas (se configurado), a app pode abrir uma rota interna, por exemplo:

`/e/:slug/events/:eventId/obrigado?orderId=...&transactionId=...`

Parâmetros são **hints** para UX; o estado de verdade continua a ser o **polling** (secção 5) ou notificação server-side futura (email, push).

### 6.2 Confirmação só com `200` em `/payment`

O frontend deve tratar `PENDING` após o redirect: mostrar “a confirmar pagamento” e continuar a consultar até `CONFIRMED` ou timeout.

---

## 7. Bilhete (pós-compra)

**Planeado:** `GET /api/public/tenants/:slug/tickets/:ticketId`

`ticketId` — UUID do bilhete individual **ou** código público opaco (`publicCode`) se preferirem path dedicado: `GET .../tickets/by-code/:code`.

### Resposta `200` (comprador — dados sensíveis moderados)

```json
{
  "id": "uuid",
  "publicCode": "string-opaca-para-qr",
  "status": "VALID | CANCELLED | REFUNDED | USED",
  "event": {
    "id": "uuid",
    "title": "string",
    "startsAt": "2026-05-01T19:00:00.000Z",
    "venueName": "string | null"
  },
  "ticketTypeName": "Ingresso inteira",
  "holderName": "Nome no bilhete",
  "orderId": "uuid"
}
```

### Erros

| Código | Quando |
|--------|--------|
| `404` | Bilhete inexistente |
| `403` | Opcional: se no futuro o acesso for autenticado e o recurso não for do utilizador |

### Validação à entrada (staff)

Pode ser outro endpoint administrativo ou com token de equipa; fora do escopo deste contrato público. O `publicCode` é o candidato a payload de QR.

---

## 8. Referência cruzada — o que já existe

| Método e caminho | Estado |
|------------------|--------|
| `POST /api/public/tenants/:slug/payer-profiles` | **Implementado** — pré-registo pagador |
| `POST /api/public/tenants/:slug/payment-intents` | **Implementado** — cobrança com `planId` ou `value` |
| `POST /api/admin/tenants/me/events/:eventId/ticket-types/:ticketTypeId/payment-link` | **Implementado (admin)** — cria/reusa link Asaas automático para tipo de ingresso |
| `GET/POST/PUT/DELETE /api/admin/tenants/me/link-presets` | **Implementado (admin)** — gestão de presets globais de links (`cotas` e `events`) |

O checkout de eventos (secção 4) pode internamente reutilizar a mesma camada Asaas/transacções, desde que `externalReference` ou metadados liguem a transacção ao `orderId` / evento.
