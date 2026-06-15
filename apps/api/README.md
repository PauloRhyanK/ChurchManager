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

### Cobrança “1 mês” que gerava assinatura prolongada

**Prevenção (código neste PR):** `subscriptionDurationMonths === 1` → `DETACHED`; presets normalizados; links legados `RECURRENT`+1 mês não são reutilizados.

**BD (automático no deploy):** migrações `20260430200000_normalize_1month_presets` e `20260525210000_deactivate_1month_recurrent_payment_links`.

**Asaas (uma vez por ambiente, após deploy):** no host com Postgres acessível (`127.0.0.1:5438` no dev):

```bash
cd apps/api
DATABASE_URL="postgresql://postgres:SENHA@127.0.0.1:5438/churchmanager_db" \
  npm run script:cleanup-1month-recurrent-links -- --dry-run
# sem --dry-run, por assinatura legada:
#   - encerra assinatura (DELETE /subscriptions; fallback PUT endDate)
#   - não estorna nem apaga cobranças já pagas/criadas (só impede novas parcelas)
# Consulta GET /payments?paymentLink=… se a BD não tiver sub_id.
```

Se `linksWithoutSubscription` no JSON tiver IDs, esses links ficaram só desactivados na BD — não houve pagamento/assinatura para corrigir no Asaas, ou falta histórico de webhook.

Diagnóstico na BD (produção):

```sql
SELECT provider_link_id, active, created_at
FROM financial_payment_links
WHERE is_monthly = true AND subscription_duration_months = 1;
```

Novos pedidos de 1 mês passam a gerar cobrança única (`DETACHED`).

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
| GET | `/api/public/tenants/:slug/events/published` | Eventos publicados (home) |
| GET | `/api/public/tenants/:slug/events?upcomingOnly=true` | Eventos futuros publicados |
| GET | `/api/public/tenants/:slug/events/:eventId` | Detalhe do evento |
| POST | `/api/public/tenants/:slug/events/:eventId/registrations` | Inscrição no evento |
| GET | `/api/admin/tenants/me/events` | CRUD eventos (Bearer JWT) |
| GET | `/api/admin/tenants/me/registrations` | Todas as inscrições com evento (Bearer JWT) |
| POST | `/api/webhooks/asaas/:slug` | Webhook por tenant (header `asaas-access-token`) |

Prefixo global: `api`.

## Documentação

Ver [docs/financial-schema-and-webhooks.md](../../docs/financial-schema-and-webhooks.md) na raiz do monorepo.
Ver [docs/migration/supabase-events-to-church-manager.md](../../docs/migration/supabase-events-to-church-manager.md) para migração do módulo de eventos.
Ver [docs/security-secrets.md](../../docs/security-secrets.md) para operação de segredo em produção.
Ver [docs/api/public-payment-links.md](../../docs/api/public-payment-links.md) (cotas, presets, cobrança única vs assinatura).
