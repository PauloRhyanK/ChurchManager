# Contrato público — `POST /api/public/tenants/:slug/links`

Gera (ou reutiliza) um **link de pagamentos** na conta Asaas da igreja (credencial por `slug`). Uso actual: **cotas**. O endpoint suporta dois modos:

- `preset_global` (default): usa presets cadastrados no admin e reusa link por `presetKey`.
- `preset_global` (default): usa presets cadastrados no admin **quando `presetKey` é enviado**; sem `presetKey`, reutiliza por configuração do payload (`isMonthly`, `subscriptionDurationMonths`, `value`, `successUrl`, `autoRedirect`), mantendo compatibilidade com o fluxo antigo.
- `cpf_custom`: cria/reusa link customizado por CPF + parâmetros.

O código deve usar um serviço partilhado de geração (`PaymentLinksGenerationService`) com `sourceKey` fixo `cotas` no `externalReference` (`cm|v1|<tenantSlug>|cotas`). **Eventos** e outros módulos podem ter **outro endpoint** que chama o mesmo serviço com outro `sourceKey` (ex.: `events-<uuid>`).

O pedido ao Asaas inclui `dueDateLimitDays` (dias úteis para vencimento quando há opção de boleto); com `billingType` `UNDEFINED` a API Asaas exige este campo.

**Comportamento `subscriptionDurationMonths` (backend):**

- **`1`**: o link é criado como **`chargeType: DETACHED`** (cobrança única). Não há recorrência — evita o bug antigo em que `RECURRENT` + 1 mês gerava **segunda cobrança** no mês seguinte. **Limpeza:** migrações `normalize_1month_presets` + `deactivate_1month_recurrent_payment_links` (deploy); opcional `npm run script:cleanup-1month-recurrent-links` (remove link no Asaas e define `endDate` em assinaturas órfãs ligadas a esses links).
- **`>= 2`** com `isMonthly: true`: **`chargeType: RECURRENT`**, `subscriptionCycle: MONTHLY`, e `endDate` (YYYY-MM-DD) = **`addMonths(hoje, N) − 1 dia`** no **link** (`POST /paymentLinks`). O painel Asaas em **Dados da assinatura** só preenche “Data de fim da assinatura” no recurso `/subscriptions`; após o primeiro `PAYMENT_CREATED` com `paymentLink`, o backend faz `PUT /subscriptions/{id}` com o mesmo `endDate` (ver `AsaasSubscriptionDurationSyncService`). Recomenda-se `TZ=America/Sao_Paulo` em produção.

Validar o comportamento na [sandbox Asaas](https://docs.asaas.com/docs/welcome-to-asaas). Referência link: [Criar um link de pagamentos](https://docs.asaas.com/reference/criar-um-link-de-pagamentos); assinatura: [Atualizar assinatura](https://docs.asaas.com/reference/atualizar-assinatura-existente).

## CORS

O browser só envia `fetch` de origens registadas para este tenant na tabela **`tenant_public_web_origins`** (gestão em **Configurações financeiras** no admin ou `GET/POST/DELETE /api/admin/tenants/me/public-web-origins`). Não uses `ADMIN_CORS_ORIGIN` para sites de clientes.

## Pedido

`Content-Type: application/json`

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|--------|
| `reuseMode` | string | não | `preset_global` (default) \| `cpf_custom` |
| `presetKey` | string | não | Chave do preset global cadastrado em `admin/tenants/me/link-presets`; se omitido, o reuso global usa a própria configuração enviada no body |
| `cpf` | string | sim em `cpf_custom` | CPF válido (11 dígitos) |
| `name` | string | sim em `cpf_custom` | Nome do pagador para busca/auditoria |
| `isMonthly` | boolean | sim em `cpf_custom` | `true` → assinatura mensal (`RECURRENT` + `MONTHLY`) **exceto** quando `subscriptionDurationMonths === 1` (tratado como cobrança única `DETACHED`); `false` → cobrança única (`DETACHED`) |
| `subscriptionDurationMonths` | integer | sim se `isMonthly` e `cpf_custom` | Entre **1** e **120**. Com **`1`**, o backend envia link de cobrança única; com **`>= 2`**, envia `endDate` conforme regra acima. |
| `value` | number | não | Reais, **≥ `5,00`** quando informado; se omitido, valor livre |
| `successUrl` | string (URL) | não | Redirecionamento após pagamento na interface Asaas (`callback.successUrl`). O **origin** tem de coincidir com uma entrada em **`tenant_public_web_origins`**. O domínio também tem de constar nos dados comerciais da conta Asaas (requisito da plataforma). |
| `autoRedirect` | boolean | não | Só com `successUrl`. Se `false`, o Asaas mostra “Ir para o site” em vez de redireccionar de imediato. Não enviar sem `successUrl`. |
| `confirmAdditional` | boolean | não | Só faz sentido com `cpf_custom`. `true` gera o link mesmo que o CPF já tenha assinatura ativa (ver `409` abaixo). |

### `cpf_custom`: um link ativo por CPF

- Se o perfil do pagador (`financial_payer_profiles`, tenant + CPF) tem `financial_subscriptions.status = 'ACTIVE'`
  e `confirmAdditional !== true`, **nada é gerado** e a resposta é `409`:
  `{ "code": "HAS_ACTIVE_CONTRIBUTION", "emailHint": "pa***@gmail.com" }` (`emailHint` é `null` sem e-mail).
- Depois de gerar ou reaproveitar o link, os **outros** links `CPF_CUSTOM` ativos do mesmo tenant + CPF passam a
  `active=false` e são removidos no Asaas (`DELETE /paymentLinks/:id`). Falha no Asaas só vai para o log.
  Desativar um link **não** cancela assinaturas já criadas por ele (o sync de `endDate` procura o link por
  `providerLinkId`, sem olhar `active`).
- Se o pedido coincide com um link do mesmo CPF já desativado (mesmo `reuseKey`), é gerado um link novo no Asaas
  e a mesma linha é atualizada (novo `providerLinkId`/`url`, `active=true`, `createdAt` = agora).

### Redirecionamento após pagamento

Com `successUrl`, o body enviado ao Asaas inclui `callback` no link de pagamentos. Detalhes de comportamento: [documentação Asaas](https://docs.asaas.com/docs/redirecionamento-apos-o-pagamento). **Boleto** pode ter fluxo diferente (pagamento fora de linha).

**Predefinição no painel:** o tenant pode guardar um URL em `PUT /api/admin/tenants/me/payment-success-redirect` (ou no formulário **Configurações** do admin). Se o pedido público **omitir** `successUrl`, usa-se esse valor da base (`tenants.payment_success_redirect_url`). Se o pedido **enviar** `successUrl`, este prevalece sobre a predefinição.

### Exemplo — preset global (12x do site)

```json
{
  "reuseMode": "preset_global",
  "presetKey": "cotas_12x_site"
}
```

### Exemplo — reuso global por configuração (sem presetKey)

```json
{
  "isMonthly": true,
  "subscriptionDurationMonths": 12
}
```

### Exemplo — custom por CPF (reuso por usuário)

```json
{
  "reuseMode": "cpf_custom",
  "cpf": "39053344705",
  "name": "Maria Silva",
  "isMonthly": false,
  "value": 50,
  "successUrl": "https://cotas.suaigreja.org/obrigado",
  "autoRedirect": true
}
```

## Resposta `201`

```json
{
  "id": "725104409743",
  "url": "https://www.asaas.com/c/...",
  "metadata": {
    "source": "cotas",
    "tenant": "slug-da-igreja",
    "reused": true
  }
}
```

No Asaas, **`externalReference`** = `cm|v1|<tenantSlug>|<sourceKey>` (ex.: `...|cotas` para este endpoint).

## Rate limit

Throttler **`links`**: **5 pedidos por minuto por IP** (além do limite global `public` de 30/min).

## Erros (mapeamento mínimo)

| HTTP | Situação | Corpo (típico Nest) |
|------|----------|---------------------|
| `400` | Validação do DTO (`value`, `isMonthly`, `successUrl` inválida ou origin não permitido, `autoRedirect` sem `successUrl`, etc.) | `message` com detalhes de validação |
| `404` | `slug` de tenant inexistente | `Igreja não encontrada` |
| `409` | `cpf_custom` com assinatura ativa e sem `confirmAdditional: true` | `{ "code": "HAS_ACTIVE_CONTRIBUTION", "emailHint": string \| null }` |
| `429` | Rate limit | Mensagem padrão do `@nestjs/throttler` |
| `502` | Falha na API Asaas | Mensagem genérica ao cliente |
| `503` | Tenant sem `asaasApiKey` configurada | `Pagamentos não estão configurados para esta igreja` |

**Logging:** em `502`, o servidor regista a causa em log — não expor texto cru da Asaas na UI pública.

## Minhas contribuições (sem login)

Rotas públicas em `/api/public/tenants/:slug/contributions` para o site mostrar ao contribuidor o que ele já gerou
ou assina. Só leitura; alterar ou cancelar fica com a secretaria.

### `POST /contributions/access-link` → `202`

Corpo `{ "cpf": string, "returnUrl": string }`. `returnUrl` é a página do site que recebe o token: HTTPS (ou http
em localhost) e origin em `tenant_public_web_origins` (mesma regra do `successUrl`; fora disso → `400`).
Se existe perfil do pagador (tenant + CPF) com e-mail, cria um token aleatório de **uso único** (guardado só como
SHA-256 em `financial_contributor_access_tokens`, expira em **30 min**) e envia por e-mail (Resend) o link
`returnUrl?token=<token>`. Responde **sempre** `{ "sent": true }`, com ou sem perfil. Rate limit: **3/min/IP**.

### `POST /contributions/session` → `200`

Corpo `{ "token": string }`. Token válido, não usado, não expirado e do mesmo tenant → marca como usado e devolve
`{ "sessionToken": string, "expiresAt": ISO }` — JWT de **30 dias** com `aud: "contributor"`, `tenantId` e `cpf`.
Caso contrário `401 { "code": "INVALID_TOKEN" }`. Rate limit: 10/min/IP.

O JWT de contribuidor é assinado com segredo próprio (`CONTRIBUTOR_JWT_SECRET` ou, sem ela, derivado de
`JWT_SECRET` por HMAC): não vale nos guards do painel (que também recusam qualquer `aud`), e o JWT do painel não
vale aqui.

### `GET /contributions/me` → `200`

Header `Authorization: Bearer <sessionToken>`. JWT inválido/expirado, `aud` diferente de `contributor` ou tenant
diferente do `slug` → `401`. Rate limit: 30/min/IP.

```json
{
  "payer": { "name": "Fulano", "emailHint": "fu***@gmail.com" },
  "subscriptions": [
    { "id": "...", "status": "ACTIVE", "valueCents": 10000, "label": "Cotas - ...",
      "createdAt": "ISO", "currentPeriodEnd": "ISO|null" }
  ],
  "payments": [
    { "date": "ISO", "valueCents": 10000, "status": "CONFIRMED", "billingType": "PIX|null" }
  ],
  "pendingLink": { "url": "https://...", "valueCents": 10000, "isMonthly": true,
                   "subscriptionDurationMonths": 12, "createdAt": "ISO" }
}
```

- `subscriptions`: todas as assinaturas do perfil (qualquer status), da mais recente para a mais antiga.
  `valueCents` e `label` vêm da última transação da assinatura (descrição do pagamento); sem transação, do plano.
- `payments`: as últimas 12 `financial_transactions` do perfil, da mais recente para a mais antiga.
- `pendingLink`: o link `CPF_CUSTOM` ativo mais recente do CPF, se nenhuma transação `CONFIRMED` do perfil foi
  criada depois dele; senão `null`. `valueCents`/`subscriptionDurationMonths` podem ser `null` (valor livre / avulso).

## Referências

- [README](./README.md) — convenções globais
- [cotas-payment-contract.md](./cotas-payment-contract.md) — fluxo alternativo com `payment-intents`
