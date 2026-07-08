# Church Manager

Monorepo com **API Nest.js** + **painel admin** (React/Vite) e Postgres. O site público de cada igreja costuma ser **outro repositório**; liga por HTTP à API.

**Para trabalhar localmente, faz só a secção seguinte.** O resto do repositório podes ignorar até precisares de Asaas, webhooks ou detalhe de arquitectura.

<h2 id="dev-quickstart">Início rápido (desenvolvimento)</h2>

1. **Postgres** a correr — na raiz: `docker compose up -d db` (só base) ou `docker compose up` (API também); detalhes em [docker/README.md](docker/README.md). Copiar [`.env.example`](.env.example) → `.env` na raiz (Docker, API, Prisma e admin).
2. **API** — na raiz do repo, preencher no `.env`: `DATABASE_URL` (host `localhost` sem Docker), `ENCRYPTION_KEY` (64 hex), `JWT_SECRET` (≥32 caracteres), `ASAAS_API_URL`, `ADMIN_CORS_ORIGIN=http://localhost:5173`.
3. Na pasta `apps/api`: `npm install` e `npx prisma migrate deploy`.
4. **Opcional:** `npx prisma db seed` — utilizador demo e origem CORS de exemplo para `http://localhost:3001`. Sem seed, regista origens no admin em **Configurações financeiras → Site público (CORS)**.
5. Na pasta `apps/api`: `npm run start:dev` (porta 3000).
6. **Admin** — pasta `apps/admin`: no `.env` da raiz, `API_URL=http://localhost:3000/api` (**com** `/api`); `npm install`, `npm run dev` (porta 8080 no Vite).
7. Abre `http://localhost:5173` — após seed, login típico `admin@demo.local` / `demo123456`.

### Se o painel der 404 nas chamadas à API

1. **DevTools → Network:** o URL tem de ser `http://localhost:3000/api/admin/...` (com **`/api`**).
2. Sem `/api` no URL → corrige `API_URL` no `.env` da raiz e reinicia o Vite.
3. Mensagem **`Cannot GET /api/admin/...`** (no browser ou na resposta) → o **código da API que está a correr é antigo** (ainda sem essa rota). **Não** é falta de `migrate`. Reconstrói e reinicia a API: em `apps/api` para o processo e volta a `npm run start:dev`; com Docker na raiz: `docker compose build api --no-cache` e `docker compose up -d api`.
4. **401** → volta ao login.

---

**Documentação extra** (abre só quando precisares): [arquitectura](docs/architecture.md) · [financeiro e webhooks Asaas](docs/financial-schema-and-webhooks.md) · [ngrok para webhooks em local](docs/webhooks-local-dev-ngrok.md) · [ADRs](docs/adr/).

**Pastas úteis:** [apps/api](apps/api/README.md) · [apps/admin](apps/admin/README.md) · [docker](docker/README.md) (inclui [QA no servidor](docker/README.md#qa-servidor))

## Licença

Ver [LICENSE](LICENSE).
