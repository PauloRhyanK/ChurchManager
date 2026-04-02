# API (Nest.js)

## Configuração

1. Copiar `.env.example` para `.env` e preencher `DATABASE_URL`, `ASAAS_API_KEY` (sandbox) e `ASAAS_WEBHOOK_TOKEN`.
2. `npm install`
3. `npx prisma migrate deploy` (ou `npx prisma migrate dev` em desenvolvimento)
4. `npx prisma db seed` — cria tenant `slug=demo` e um plano de exemplo
5. `npm run start:dev`

## Endpoints relevantes

| Método | Caminho | Descrição |
|--------|---------|-----------|
| POST | `/api/public/tenants/:slug/payer-profiles` | Pré-cadastro (CPF, nome, email, telefone) |
| POST | `/api/public/tenants/:slug/payment-intents` | Gera cobrança Asaas (exige pré-cadastro) |
| POST | `/api/webhooks/asaas` | Webhook (header `asaas-access-token`) |

Prefixo global: `api`.

## Documentação

Ver [docs/financial-schema-and-webhooks.md](../../docs/financial-schema-and-webhooks.md) na raiz do monorepo.
