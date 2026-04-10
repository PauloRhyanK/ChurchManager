# Contratos HTTP para o frontend (API pública)

Documentação orientada ao consumo pelo site/app. Os caminhos assumem o **prefixo global** da API Nest: **`/api`**.

## Convenções

| Tópico | Convenção |
|--------|-----------|
| Base | `{API_ORIGIN}/api` (ex.: `https://api.exemplo.org/api`) |
| Tenant público | `:slug` na URL — igreja identificada sem JWT (alinhado a `public/tenants/:slug/...`) |
| Conteúdo | `Content-Type: application/json` em pedidos com corpo |
| Datas | ISO 8601 em UTC ou offset explícito (`2026-04-10T14:30:00.000Z`) |
| IDs | UUID v4 em string, salvo indicação contrária |
| Valores monetários | Na API, **reais com até 2 casas decimais** onde o campo for decimal; onde existir `*Cents`, inteiro em centavos |
| Erros (validação Nest) | `400` com corpo típico `{ "statusCode": 400, "message": string \| string[], "error": "Bad Request" }` |
| Rate limit | Throttling global em rotas públicas (ajustar UX com retry/backoff) |

## Documentos por domínio

| Documento | Conteúdo |
|-----------|----------|
| [events-public-contract.md](./events-public-contract.md) | Eventos, detalhe, ingressos, fluxo de pagamento, conclusão e bilhete |
| [cotas-payment-contract.md](./cotas-payment-contract.md) | Links/cobranças Asaas para **cotas** (valor fixo da cota vs valor livre) |
| [public-payment-links.md](./public-payment-links.md) | **`POST .../links`** — link de pagamento Asaas (único vs mensal, valor opcional) |

## Implementação vs planeamento

- Rotas já existentes no repositório estão assinaladas nos documentos.
- Rotas marcadas como **planeadas** são contratos alvo para implementação; o frontend pode gerar tipos e mocks a partir destes ficheiros até os controllers existirem.

## Relação com o domínio financeiro

Modelo de dados, webhooks Asaas e rotas financeiras já descritas no código: [financial-schema-and-webhooks.md](../financial-schema-and-webhooks.md).
