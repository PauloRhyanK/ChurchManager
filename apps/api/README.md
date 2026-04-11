# API (Nest.js)

Fluxo mínimo local (ordem e variáveis): **[README na raiz do monorepo](../../README.md#dev-quickstart)**.

## Configuração

1. Copiar `.env.example` para `.env` e preencher variáveis obrigatórias (ver `.env.example`). `ADMIN_CORS_ORIGIN` = origens do **painel admin** apenas (ex. `http://localhost:5173`). Sites públicos por igreja: tabela `tenant_public_web_origins` (painel **Configurações financeiras** ou rotas `.../public-web-origins`).
2. `npm install`
3. `npx prisma migrate deploy` (ou `npx prisma migrate dev` em desenvolvimento)
4. Opcional: `npx prisma db seed` — tenant demo, admin, origem CORS de exemplo `http://localhost:3001`
5. `npm run start:dev`

## Docker

Compose na raiz: [docker/README.md](../../docker/README.md). Copiar [`.env.docker.example`](../../.env.docker.example) → `.env.docker`. O entrypoint da API aplica migrações ao arranque; seed só com `RUN_SEED=true`.

## Webhooks em desenvolvimento local

O Asaas precisa de um URL público (HTTPS). Ver [docs/webhooks-local-dev-ngrok.md](../../docs/webhooks-local-dev-ngrok.md) (ngrok + configuração no Asaas).

## Endpoints relevantes

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/api/health` | Liveness (sem auth; healthcheck Docker) |
| POST | `/api/auth/login` | Login admin (`email`, `password`) → JWT |
| GET | `/api/admin/tenants/me/financial-setup` | Estado Asaas configurado? (Bearer JWT) |
| PUT | `/api/admin/tenants/me/asaas-credentials` | Atualiza credenciais Asaas (valida no Asaas; Bearer JWT) |
| GET | `/api/admin/tenants/me/public-web-origins` | Lista origens de browser autorizadas para `/api/public/tenants/:slug/...` (Bearer JWT) |
| POST | `/api/admin/tenants/me/public-web-origins` | Regista origem (`{ "origin": "https://..." }`; Bearer JWT) |
| DELETE | `/api/admin/tenants/me/public-web-origins/:id` | Remove origem (Bearer JWT) |
| GET | `/api/admin/tenants/me/cotas` | Lista cotas paginada (`page`, `limit`, `status`, `q`; Bearer JWT) |
| POST | `/api/public/tenants/:slug/payer-profiles` | Pré-cadastro (CPF, nome, email, telefone) |
| POST | `/api/public/tenants/:slug/payment-intents` | Gera cobrança Asaas (exige pré-cadastro) |
| POST | `/api/public/tenants/:slug/links` | Gera link de pagamento Asaas (cotas; ver `docs/api/public-payment-links.md`) |
| POST | `/api/webhooks/asaas/:slug` | Webhook por tenant (header `asaas-access-token`) |

Prefixo global: `api`.

## Documentação

Ver [docs/financial-schema-and-webhooks.md](../../docs/financial-schema-and-webhooks.md) na raiz do monorepo.
Ver [docs/security-secrets.md](../../docs/security-secrets.md) para operação de segredo em produção.
