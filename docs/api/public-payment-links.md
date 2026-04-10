# Contrato público — `POST /api/public/tenants/:slug/links`

Gera um **link de pagamentos** na conta Asaas da igreja (credencial por `slug`). Uso actual: **cotas** (a igreja não expõe campus no produto — um único contexto). O valor pode ser fixo no link ou livre (omitir `value`).

O código deve usar um serviço partilhado de geração (`PaymentLinksGenerationService`) com `sourceKey` fixo `cotas` no `externalReference` (`cm|v1|<tenantSlug>|cotas`). **Eventos** e outros módulos podem ter **outro endpoint** que chama o mesmo serviço com outro `sourceKey` (ex.: `events-<uuid>`).

## Pedido

`Content-Type: application/json`

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|--------|
| `isMonthly` | boolean | sim | `true` → assinatura mensal (`RECURRENT` + `MONTHLY` no Asaas); `false` → cobrança única (`DETACHED`) |
| `value` | number | não | Reais, ≥ `0.01`, 2 decimais. Se omitido ou `null`, o pagador define o valor na página Asaas |

### Exemplo — valor livre, mensal

```json
{
  "isMonthly": true
}
```

### Exemplo — valor fixo, pagamento único

```json
{
  "isMonthly": false,
  "value": 50
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
| `400` | Validação do DTO (`value`, `isMonthly`, etc.) | `message` com detalhes de validação |
| `404` | `slug` de tenant inexistente | `Igreja não encontrada` |
| `429` | Rate limit | Mensagem padrão do `@nestjs/throttler` |
| `502` | Falha na API Asaas | Mensagem genérica ao cliente |
| `503` | Tenant sem `asaasApiKey` configurada | `Pagamentos não estão configurados para esta igreja` |

**Logging:** em `502`, o servidor regista a causa em log — não expor texto cru da Asaas na UI pública.

## Referências

- [README](./README.md) — convenções globais
- [cotas-payment-contract.md](./cotas-payment-contract.md) — fluxo alternativo com `payment-intents`
