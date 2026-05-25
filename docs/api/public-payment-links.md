# Contrato público — `POST /api/public/tenants/:slug/links`

Gera (ou reutiliza) um **link de pagamentos** na conta Asaas da igreja (credencial por `slug`). Uso actual: **cotas**. O endpoint suporta dois modos:

- `preset_global` (default): usa presets cadastrados no admin e reusa link por `presetKey`.
- `preset_global` (default): usa presets cadastrados no admin **quando `presetKey` é enviado**; sem `presetKey`, reutiliza por configuração do payload (`isMonthly`, `subscriptionDurationMonths`, `value`, `successUrl`, `autoRedirect`), mantendo compatibilidade com o fluxo antigo.
- `cpf_custom`: cria/reusa link customizado por CPF + parâmetros.

O código deve usar um serviço partilhado de geração (`PaymentLinksGenerationService`) com `sourceKey` fixo `cotas` no `externalReference` (`cm|v1|<tenantSlug>|cotas`). **Eventos** e outros módulos podem ter **outro endpoint** que chama o mesmo serviço com outro `sourceKey` (ex.: `events-<uuid>`).

O pedido ao Asaas inclui `dueDateLimitDays` (dias úteis para vencimento quando há opção de boleto); com `billingType` `UNDEFINED` a API Asaas exige este campo.

**Comportamento `subscriptionDurationMonths` (backend):**

- **`1`**: o link é criado como **`chargeType: DETACHED`** (cobrança única). Não há recorrência — evita o caso em que assinatura mensal com `endDate` mal dimensionado gerava uma segunda cobrança no mês seguinte.
- **`>= 2`** com `isMonthly: true`: **`chargeType: RECURRENT`**, `subscriptionCycle: MONTHLY`, e `endDate` (YYYY-MM-DD) = **`addMonths(hoje, N) − 1 dia`** (`date-fns`, calendário local do servidor Node). Isto limita a recorrência para gerar **N** cobranças mensais em vez de `N+1`. Recomenda-se `TZ=America/Sao_Paulo` em produção.

Validar o comportamento exacto na [sandbox Asaas](https://docs.asaas.com/docs/welcome-to-asaas).

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
| `429` | Rate limit | Mensagem padrão do `@nestjs/throttler` |
| `502` | Falha na API Asaas | Mensagem genérica ao cliente |
| `503` | Tenant sem `asaasApiKey` configurada | `Pagamentos não estão configurados para esta igreja` |

**Logging:** em `502`, o servidor regista a causa em log — não expor texto cru da Asaas na UI pública.

## Referências

- [README](./README.md) — convenções globais
- [cotas-payment-contract.md](./cotas-payment-contract.md) — fluxo alternativo com `payment-intents`
