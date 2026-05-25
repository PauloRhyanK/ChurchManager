# API (Nest.js)

Fluxo mínimo local (ordem e variáveis): **[README na raiz do monorepo](../../README.md#dev-quickstart)**.

## Configuração

1. Copiar `.env.example` para `.env` e preencher variáveis obrigatórias (ver `.env.example`). `ADMIN_CORS_ORIGIN` = origens do **painel admin** apenas (ex. `http://localhost:5173`). Sites públicos por igreja: tabela `tenant_public_web_origins` (painel **Configurações financeiras** ou rotas `.../public-web-origins`).
2. `npm install`
3. `npx prisma migrate deploy` (ou `npx prisma migrate dev` em desenvolvimento)
4. Opcional: `npx prisma db seed` — tenant demo, admin com papel **`PLATFORM_ADMIN`**, origem CORS de exemplo `http://localhost:3001`
5. `npm run start:dev`

### Plataforma (criar igrejas)

Utilizadores com `role = PLATFORM_ADMIN` na tabela `admin_users` podem chamar:

- `GET /api/admin/platform/tenants` — lista tenants (id, nome, slug, data de criação).
- `POST /api/admin/platform/tenants` — cria tenant + primeiro `TENANT_ADMIN` (corpo: `name`, `slug`, `adminEmail`, `adminPassword`). Limite de pedidos: throttler `platform` (10/min por IP).

O painel admin mostra **Plataforma → Igrejas** só para esse papel. Em **produção**, altere a palavra-passe do seed e promova outros operadores via SQL (`UPDATE admin_users SET role = 'PLATFORM_ADMIN' WHERE …`) se necessário; não deixe credenciais de demonstração activas.

## Docker

Compose na raiz: [docker/README.md](../../docker/README.md). Copiar [`.env.example`](../../.env.example) → `.env` na raiz. O entrypoint da API aplica migrações ao arranque; seed só com `RUN_SEED=true`. Prisma CLI: `npm run prisma:migrate` (lê `../../.env` via dotenv-cli).

### Scripts operacionais

O `.env` pode manter `DATABASE_URL` com host `db` / `churchmanager-postgres` (válido **dentro** do Docker). Para correr scripts **no host**, não altere o ficheiro: passe a URL na linha de comando (o `dotenv` não sobrescreve variáveis já definidas no shell).

**Opção 1 — host** (exige Postgres acessível; no dev o compose expõe `127.0.0.1:5438`):

```bash
cd apps/api
DATABASE_URL="postgresql://postgres:SENHA@127.0.0.1:5438/churchmanager_db" \
  npm run script:backfill-subscription-end-dates -- --dry-run
```

**Opção 2 — Docker** (BD só na rede interna; sem mudar `.env`), na **raiz** do repo:

```bash
docker compose -f docker-compose.dev.yml run --rm --entrypoint sh \
  -v "$PWD/apps/api/scripts:/app/scripts:ro" \
  -v "$PWD/apps/api/src:/app/src:ro" \
  churchmanager-backend-api \
  -c "./node_modules/.bin/tsx scripts/backfill-subscription-end-dates.ts --dry-run"
```

Cleanup (`script:cleanup-1month-recurrent-links`): mesma ideia — `DATABASE_URL=...` no host ou `compose run` com os volumes acima.

Backfill: assinaturas com `subscriptionDurationMonths >= 2` e pares nos webhooks. Cleanup: links antigos “mensal + 1 mês” no Asaas + `active=false` na BD.

## Webhooks em desenvolvimento local

O Asaas precisa de um URL público (HTTPS). Ver [docs/webhooks-local-dev-ngrok.md](../../docs/webhooks-local-dev-ngrok.md) (ngrok + configuração no Asaas).

## Endpoints relevantes

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/api/health` | Liveness (sem auth; healthcheck Docker) |
| POST | `/api/auth/login` | Login admin (`email`, `password`) → JWT (resposta inclui `user.role`) |
| GET | `/api/admin/platform/tenants` | Lista igrejas — só `PLATFORM_ADMIN` (Bearer JWT) |
| POST | `/api/admin/platform/tenants` | Cria igreja + admin inicial — só `PLATFORM_ADMIN` (Bearer JWT) |
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
Ver [docs/api/public-payment-links.md](../../docs/api/public-payment-links.md) (cotas, presets, cobrança única vs assinatura).
