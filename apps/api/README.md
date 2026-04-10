# API (Nest.js)

## Configuração

1. Copiar `.env.example` para `.env` e preencher `DATABASE_URL`, `ENCRYPTION_KEY` e `ASAAS_API_URL`.
2. `npm install`
3. `npx prisma migrate deploy` (ou `npx prisma migrate dev` em desenvolvimento)
4. `npx prisma db seed` — cria tenant `slug=demo` e um plano de exemplo
5. `npm run start:dev`

## Endpoints relevantes

| Método | Caminho | Descrição |
|--------|---------|-----------|
| POST | `/api/public/tenants/:slug/payer-profiles` | Pré-cadastro (CPF, nome, email, telefone) |
| POST | `/api/public/tenants/:slug/payment-intents` | Gera cobrança Asaas (exige pré-cadastro) |
| PUT | `/api/admin/tenants/:id/asaas-credentials` | Atualiza credenciais Asaas da igreja (valida no Asaas antes de salvar) |
| POST | `/api/webhooks/asaas/:slug` | Webhook por tenant (header `asaas-access-token`) |

Prefixo global: `api`.

## Documentação

Ver [docs/financial-schema-and-webhooks.md](../../docs/financial-schema-and-webhooks.md) na raiz do monorepo.
Ver [docs/security-secrets.md](../../docs/security-secrets.md) para operação de segredo em produção.
