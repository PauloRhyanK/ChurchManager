# API (Nest.js)

## Configuração

1. Copiar `.env.example` para `.env` e preencher `DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET` (≥32 caracteres), `ASAAS_API_URL` e, para o painel admin local, `ADMIN_CORS_ORIGIN` (ex.: `http://localhost:5173`).
2. `npm install`
3. `npx prisma migrate deploy` (ou `npx prisma migrate dev` em desenvolvimento)
4. `npx prisma db seed` — cria tenant `slug=demo`, plano de exemplo e utilizador admin (email/senha configuráveis com `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`; padrão `admin@demo.local` / `demo123456`).
5. `npm run start:dev`

## Endpoints relevantes

| Método | Caminho | Descrição |
|--------|---------|-----------|
| POST | `/api/auth/login` | Login admin (`email`, `password`) → JWT |
| GET | `/api/admin/tenants/me/financial-setup` | Estado Asaas configurado? (Bearer JWT) |
| PUT | `/api/admin/tenants/me/asaas-credentials` | Atualiza credenciais Asaas (valida no Asaas; Bearer JWT) |
| GET | `/api/admin/tenants/me/cotas` | Lista cotas paginada (`page`, `limit`, `status`, `q`; Bearer JWT) |
| POST | `/api/public/tenants/:slug/payer-profiles` | Pré-cadastro (CPF, nome, email, telefone) |
| POST | `/api/public/tenants/:slug/payment-intents` | Gera cobrança Asaas (exige pré-cadastro) |
| POST | `/api/webhooks/asaas/:slug` | Webhook por tenant (header `asaas-access-token`) |

Prefixo global: `api`.

## Documentação

Ver [docs/financial-schema-and-webhooks.md](../../docs/financial-schema-and-webhooks.md) na raiz do monorepo.
Ver [docs/security-secrets.md](../../docs/security-secrets.md) para operação de segredo em produção.
