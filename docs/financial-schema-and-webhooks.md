# Domínio financeiro — esquema `financial_*`, Asaas e idempotência

Este documento especifica o modelo de dados financeiro e o fluxo de integração com **Asaas**, alinhado à regra: **apenas o backend Nest.js** usa `ASAAS_API_KEY` e chama a API Asaas; frontends só pedem intenções de pagamento à nossa API.

## 1. Tabelas

### 1.1 `financial_payer_profiles` (pré-cadastro por CPF)

Armazena dados da pessoa **por tenant**, antes ou em paralelo à cobrança. O CPF é normalizado para **11 dígitos**; unicidade **`(tenant_id, cpf)`**. O campo `asaas_customer_id` liga ao cliente criado na API Asaas quando a primeira cobrança é pedida.

| Coluna | Tipo | Notas |
|--------|------|--------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK NOT NULL — isolamento multitenant |
| `cpf` | CHAR(11) | Apenas dígitos |
| `name`, `email`, `phone` | | Alinhados ao cadastro de cliente Asaas |
| `asaas_customer_id` | VARCHAR | Preenchido após primeira sincronização com Asaas |

**LGPD:** não registar CPF em logs em claro; políticas de retenção conforme produto.

Rotas públicas (sem JWT): o tenant é resolvido por **`slug`** na URL — ver secção 2.1.

### 1.2 `financial_webhook_events` (idempotência)

Tabela de deduplicação de webhooks: `idempotency_key` **UNIQUE** (ex.: `evento:paymentId` ou header `idempotency-key`). Evita processar duas vezes o mesmo evento da Asaas.

### 1.3 `financial_plans`

Planos de assinatura oferecidos ao tenant (ou globais, conforme regra de negócio acordada).


| Coluna                                | Tipo              | Notas                                                                                                                                   |
| ------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                  | UUID              | PK                                                                                                                                      |
| `tenant_id`                           | UUID              | FK para `tenants.id` — se os planos forem por igreja; se forem globais, avaliar `tenant_id` NULL ou tabela de associação num ADR futuro |
| `name`                                | VARCHAR           | Nome exibível                                                                                                                           |
| `description`                         | TEXT              | Opcional                                                                                                                                |
| `asaas_plan_id` ou referência externa | VARCHAR           | ID ou chave do plano no Asaas, se aplicável                                                                                             |
| `amount_cents` ou decimal             | INTEGER / NUMERIC | Valor e moeda conforme produto                                                                                                          |
| `interval`                            | VARCHAR           | Ex.: `MONTHLY`, `YEARLY`                                                                                                                |
| `is_active`                           | BOOLEAN           | DEFAULT true                                                                                                                            |
| `created_at` / `updated_at`           | TIMESTAMPTZ       | Auditoria                                                                                                                               |


Índices: pelo menos `(tenant_id)` ou critério de listagem principal.

### 1.4 `financial_subscriptions`

Assinaturas ligadas a um tenant e a um utilizador ou entidade de cobrança.


| Coluna                      | Tipo        | Notas                                             |
| --------------------------- | ----------- | ------------------------------------------------- |
| `id`                        | UUID        | PK                                                |
| `tenant_id`                 | UUID        | FK NOT NULL — isolamento multitenant              |
| `plan_id`                   | UUID        | FK para `financial_plans.id`                      |
| `payer_profile_id`          | UUID        | FK opcional para `financial_payer_profiles.id`   |
| `asaas_customer_id`         | VARCHAR     | ID do cliente no Asaas                            |
| `asaas_subscription_id`     | VARCHAR     | ID da subscrição no Asaas (único por integração)  |
| `status`                    | VARCHAR     | Ex.: `PENDING`, `ACTIVE`, `PAST_DUE`, `CANCELLED` |
| `current_period_end`        | TIMESTAMPTZ | Opcional, para UI                                 |
| `created_at` / `updated_at` | TIMESTAMPTZ |                                                   |


Índices únicos recomendados: `asaas_subscription_id` (onde NOT NULL); `(tenant_id, id)` para lookups seguros.

### 1.5 `financial_transactions`

Movimentos financeiros e correlação com eventos Asaas (pagamentos, estornos, etc.).


| Coluna                                   | Tipo          | Notas                                                                                           |
| ---------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `id`                                     | UUID          | PK                                                                                              |
| `tenant_id`                              | UUID          | FK NOT NULL                                                                                     |
| `subscription_id`                        | UUID          | FK para `financial_subscriptions.id`, opcional (pagamentos avulsos)                             |
| `payer_profile_id`                       | UUID          | FK opcional para `financial_payer_profiles.id`                                                    |
| `asaas_payment_id`                       | VARCHAR       | ID do pagamento no Asaas                                                                        |
| `asaas_event_id` ou `external_event_key` | VARCHAR       | Identificador **estável** do evento de webhook para idempotência (ver secção 3)                 |
| `type`                                   | VARCHAR       | Ex.: `PAYMENT_CONFIRMED`, `PAYMENT_REFUNDED`                                                    |
| `amount_cents`                           | INTEGER       | Ou NUMERIC + moeda                                                                              |
| `status`                                 | VARCHAR       | Ex.: `PENDING`, `CONFIRMED`, `FAILED`                                                           |
| `raw_payload_ref`                        | TEXT ou JSONB | Opcional: referência ou payload resumido para auditoria (evitar dados sensíveis desnecessários) |
| `created_at`                             | TIMESTAMPTZ   |                                                                                                 |


Índices: **único** em `asaas_event_id` (ou combinação acordada com a documentação Asaas) para deduplicação; `asaas_payment_id`; `(tenant_id, created_at)`.

## 2. Fluxo REST (síntese)

### 2.1 Rotas públicas por `slug` (site / formulário)

Identificação da igreja pelo **`slug`** do tenant na URL; **sem** JWT. Rate limiting aplicado.

1. **`POST /api/public/tenants/:slug/payer-profiles`** — corpo: `cpf`, `name`, `email`, `phone?`. *Upsert* em `financial_payer_profiles`.
2. **`POST /api/public/tenants/:slug/payment-intents`** — corpo: `cpf`, `planId` **ou** `value` (reais), `billingType` (`PIX` \| `BOLETO` \| `UNDEFINED`). Exige perfil pré-cadastrado; cria cliente Asaas se necessário; cria cobrança; grava `financial_transactions` como **PENDING**; resposta com `invoiceUrl`, `bankSlipUrl`, dados PIX quando aplicável.

### 2.2 Fluxo geral Asaas

1. **Nest.js:** cria ou reutiliza cliente no Asaas (adapter HTTP); cria pagamento; persiste transacção **PENDING**.
2. **Asaas** notifica o estado final via **webhook**.
3. **Nest.js — webhook:** `POST /api/webhooks/asaas`; header `asaas-access-token` igual a `ASAAS_WEBHOOK_TOKEN`; processamento **idempotente** (secção 3) via tabela `financial_webhook_events`.

Nenhum frontend importa SDK ou variáveis Asaas.

Implementação de referência: [apps/api](../apps/api) (Prisma + Nest.js).

## 3. Webhook Asaas — idempotência e transacções

### 3.1 Ameaças

- Entrega **duplicada** do mesmo evento (retries da Asaas).
- Pedidos **concorrentes** com o mesmo `payment_id` ou `event_id`.
- Falha a meio da escrita: estado inconsistente entre `financial_transactions` e `financial_subscriptions`.

### 3.2 Estratégia recomendada

1. **Validação de entrada:** verificar assinatura/token do webhook **antes** de alterar dados.
2. **Chave idempotente:** extrair da payload um identificador estável — por exemplo `id` do evento Asaas ou combinação documentada `(event_type + payment_id)` — e gravá-lo em `financial_transactions.asaas_event_id` (ou tabela dedicada `webhook_events_processed`).
3. **Transação de base de dados:** envolver o processamento em **uma transação** (`BEGIN … COMMIT`):
  - Inserir ou actualizar registo de deduplicação com **constraint UNIQUE** na chave idempotente; se violação de unicidade, **commit** vazio e responder `200` (evento já processado).
  - Alternativa: `INSERT … ON CONFLICT DO NOTHING` e, se zero linhas afectadas, sair cedo.
4. **Locks:** em PostgreSQL, para o mesmo `payment_id`, pode usar `SELECT … FOR UPDATE` sobre a linha de `financial_transactions` ou subscrição **dentro** da mesma transacção, para serializar actualizações concorrentes.
5. **Resposta HTTP:** devolver sucesso quando o evento foi aceite ou já tinha sido processado (idempotência), para a Asaas não reencaminhar indefinidamente; códigos de erro apenas para falhas recuperáveis conforme política Asaas.

### 3.3 Estado após processamento

- Actualizar `financial_transactions.status` e montantes.
- Actualizar `financial_subscriptions.status` e datas de período quando o evento assim o exigir.
- Opcional: tabela `financial_webhook_inbox` com estado `RECEIVED | PROCESSED | FAILED` para reprocessamento manual — fora do MVP se a lógica acima for suficiente.

## 4. Referências

- [architecture.md](./architecture.md)
- [ADR 0001](./adr/0001-from-supabase-to-nest-api.md)

