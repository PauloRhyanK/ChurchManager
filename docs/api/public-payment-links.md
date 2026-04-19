# Contrato público — `POST /api/public/tenants/:slug/links`

Gera um **link de pagamentos** na conta Asaas da igreja (credencial por `slug`). Uso actual: **cotas** (a igreja não expõe campus no produto — um único contexto). O valor pode ser fixo no link ou livre (omitir `value`).

O código deve usar um serviço partilhado de geração (`PaymentLinksGenerationService`) com `sourceKey` fixo `cotas` no `externalReference` (`cm|v1|<tenantSlug>|cotas`). **Eventos** e outros módulos podem ter **outro endpoint** que chama o mesmo serviço com outro `sourceKey` (ex.: `events-<uuid>`).

O pedido ao Asaas inclui `dueDateLimitDays` (dias úteis para vencimento quando há opção de boleto); com `billingType` `UNDEFINED` a API Asaas exige este campo. Em assinaturas (`isMonthly: true`), envia-se também `endDate` (YYYY-MM-DD) derivado de `subscriptionDurationMonths` para limitar a vigência da recorrência no link — validar o comportamento exacto na [sandbox Asaas](https://docs.asaas.com/docs/welcome-to-asaas). O cálculo usa o calendário local do servidor Node (recomenda-se `TZ=America/Sao_Paulo` em produção).

## CORS

O browser só envia `fetch` de origens registadas para este tenant na tabela **`tenant_public_web_origins`** (gestão em **Configurações financeiras** no admin ou `GET/POST/DELETE /api/admin/tenants/me/public-web-origins`). Não uses `ADMIN_CORS_ORIGIN` para sites de clientes.

## Pedido

`Content-Type: application/json`

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|--------|
| `isMonthly` | boolean | sim | `true` → assinatura mensal (`RECURRENT` + `MONTHLY` no Asaas); `false` → cobrança única (`DETACHED`) |
| `subscriptionDurationMonths` | integer | sim se `isMonthly` | Entre **1** e **120**. Duração da assinatura em meses; a API calcula `endDate` para o link Asaas |
| `value` | number | não | Reais, **≥ `5,00`** quando informado (mínimo Asaas). 2 decimais. Se omitido ou `null`, o pagador define o valor na página Asaas |
| `successUrl` | string (URL) | não | Redirecionamento após pagamento na interface Asaas (`callback.successUrl`). O **origin** tem de coincidir com uma entrada em **`tenant_public_web_origins`**. O domínio também tem de constar nos dados comerciais da conta Asaas (requisito da plataforma). |
| `autoRedirect` | boolean | não | Só com `successUrl`. Se `false`, o Asaas mostra “Ir para o site” em vez de redireccionar de imediato. Não enviar sem `successUrl`. |

### Redirecionamento após pagamento

Com `successUrl`, o body enviado ao Asaas inclui `callback` no link de pagamentos. Detalhes de comportamento: [documentação Asaas](https://docs.asaas.com/docs/redirecionamento-apos-o-pagamento). **Boleto** pode ter fluxo diferente (pagamento fora de linha).

**Predefinição no painel:** o tenant pode guardar um URL em `PUT /api/admin/tenants/me/payment-success-redirect` (ou no formulário **Configurações** do admin). Se o pedido público **omitir** `successUrl`, usa-se esse valor da base (`tenants.payment_success_redirect_url`). Se o pedido **enviar** `successUrl`, este prevalece sobre a predefinição.

### Exemplo — valor livre, mensal (12 meses)

```json
{
  "isMonthly": true,
  "subscriptionDurationMonths": 12
}
```

### Exemplo — valor fixo, pagamento único

```json
{
  "isMonthly": false,
  "value": 50
}
```

### Exemplo — com retorno ao site de cotas após pagar

```json
{
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
    "tenant": "slug-da-igreja"
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
