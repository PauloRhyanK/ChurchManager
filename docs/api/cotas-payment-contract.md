# Contrato público — Pagamento de cotas (Asaas)

Objetivo: o frontend solicita **cobrança com link/boleto/PIX** sem contactar a API Asaas. O tenant continua identificado por **`slug`**.

**Estado:** o padrão **com valor de plano** vs **valor livre** já existe em `POST .../payment-intents`. Este documento formaliza o contrato para **cotas** e propõe extensões opcionais.

---

## 1. Contexto e rotas existentes

### 1.1 Pré-cadastro do pagador

**Implementado:** `POST /api/public/tenants/:slug/payer-profiles`

Corpo (validação actual):

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `cpf` | string (11 dígitos) | sim |
| `name` | string | sim |
| `email` | string (email) | sim |
| `phone` | string | não |

Resposta `200`:

```json
{
  "id": "uuid",
  "updatedAt": "2026-04-10T12:00:00.000Z"
}
```

### 1.2 Criar cobrança (intenção de pagamento)

**Implementado:** `POST /api/public/tenants/:slug/payment-intents`

Corpo (semântica actual em [create-payment-intent.dto.ts](../../apps/api/src/modules/financial/dto/create-payment-intent.dto.ts)):

| Campo | Tipo | Obrigatório | Regras |
|-------|------|-------------|--------|
| `cpf` | string | sim | Deve existir perfil (fluxo típico: primeiro `payer-profiles`) |
| `planId` | uuid | não | Se presente, valor vem do plano (**cota com valor fixo**) |
| `value` | number | condicional | Obrigatório se **não** houver `planId`; reais, ≥ `0.01`, 2 decimais (**cota com valor livre**) |
| `billingType` | string | sim | `PIX` \| `BOLETO` \| `UNDEFINED` |

Resposta: objecto com `transactionId`, `asaasPaymentId`, `status`, `billingType`, `value`, `dueDate`, `invoiceUrl`, `bankSlipUrl`, `pix?` — espelhar a implementação actual de [payment-intents.service.ts](../../apps/api/src/modules/financial/payment-intents.service.ts).

---

## 2. Mapeamento de negócio — “Cotas”

| Cenário de produto | Parâmetros na API |
|--------------------|-------------------|
| Cota mensal/anual com valor definido na administração | `planId` = UUID do `FinancialPlan` (ou entidade futura `CotaPlan` alinhada ao mesmo contrato) |
| Oferta / valor simbólico livre (arredondamento na UI) | `value` em reais, sem `planId` |
| Dízimo ou donativo recorrente | Pode usar o mesmo endpoint com `planId` ou `value` conforme modelo de dados acordado |

---

## 3. Extensões planeadas (opcional)

Estas não são obrigatórias no MVP; servem para alinhar frontend e backend antes de codificar.

### 3.1 Metadados de origem

**Planeado — campo opcional no body de `payment-intents`:**

```json
{
  "cpf": "...",
  "planId": "uuid",
  "billingType": "PIX",
  "metadata": {
    "source": "COTAS_PAGE",
    "campaignId": "uuid-opcional",
    "notes": "string curta opcional"
  }
}
```

- Persistência: JSON em coluna `metadata` da transacção ou tabela de extensão.
- Útil para relatórios sem alterar o valor cobrado.

### 3.2 Endpoint dedicado só para cotas (alias)

**Planeado:** `POST /api/public/tenants/:slug/cotas/payment-links`

Comportamento **idêntico** a `payment-intents`, com validação extra (ex.: só `planId` de tipo “cota”). Reduz acoplamento semântico no frontend (`fetch('/cotas/payment-links')`).

Corpo espelha a secção 1.2 + opcionalmente `metadata` (3.1).

### 3.3 Consultar estado da cobrança

**Planeado:** `GET /api/public/tenants/:slug/payments/:transactionId`

Resposta alinhada a [events-public-contract.md](./events-public-contract.md) secção 5 (status `PENDING` \| `CONFIRMED` \| …).

**Nota:** hoje a confirmação vem do webhook; este GET exige implementação de leitura em `financial_transactions` com política de privacidade (só quem conhece o `transactionId` e eventualmente dados do pagador).

---

## 4. Segurança e UX

- **Nunca** expor `ASAAS_API_KEY` no frontend.
- **CPF:** não registar em logs client-side em claro em ambientes partilhados; seguir política LGPD do produto.
- **Link de pagamento:** `invoiceUrl` é o “link Asaas” principal para cartão/redirect conforme configuração da conta Asaas.
- **Idempotência:** para evitar duplo clique, o frontend pode enviar header `Idempotency-Key` se o backend for estendido para o suportar (o webhook já usa idempotência do lado servidor).

---

## 5. Erros comuns

| Situação | Código sugerido |
|----------|-----------------|
| CPF sem perfil prévio | `404` — implementação actual: “Perfil não encontrado; faça primeiro o pré-cadastro” (`POST .../payer-profiles`) |
| `planId` e `value` ambos ausentes ou ambos conflituosos | `400` |
| Plano inactivo | `400` ou `404` |
| Falha Asaas | `502` ou `500` com mensagem genérica ao utilizador; detalhe só em logs servidor |

---

## 6. Referências

- [financial-schema-and-webhooks.md](../financial-schema-and-webhooks.md) — webhooks e modelo `financial_*`
- [events-public-contract.md](./events-public-contract.md) — polling de pagamento partilhado
- [README.md](./README.md) — convenções globais
