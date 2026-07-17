# Docker (Postgres + API)

Stack de **desenvolvimento local** com PostgreSQL e a API Nest em contentores. Em **produção**, costuma-se usar Postgres gerido e a mesma imagem da API com variáveis injectadas pelo CI/CD ou orquestrador — ver secção [Produção](#produção).

Ordem geral e variáveis (admin + API + 404): **[README na raiz — Início rápido](../README.md#dev-quickstart)**.

## Pré-requisitos

- Docker e Docker Compose v2
- Ficheiro `.env` na **raiz do repositório** (não commitado), criado a partir de [`.env.example`](../.env.example)

## Arranque rápido (Compose)

Na raiz do monorepo:

```bash
cp .env.example .env
# Editar .env: ENCRYPTION_KEY (64 hex), JWT_SECRET (≥32 caracteres), DATABASE_URL (host db), etc.

docker compose build
docker compose up
```

- API: `http://localhost:3000/api`
- Health: `GET http://localhost:3000/api/health` — usado pelo healthcheck do contentor

Após alterar código da API, `docker compose build api && docker compose up -d api` para o contentor servir as rotas novas (evita 404 no admin).

## Webhooks Asaas em local (ngrok)

O Asaas não consegue chamar `localhost`. Guia completo: [docs/webhooks-local-dev-ngrok.md](../docs/webhooks-local-dev-ngrok.md).

### Forma mais simples com Docker: ngrok no Compose

1. Obtém o **authtoken** em [dashboard ngrok](https://dashboard.ngrok.com/get-started/your-authtoken).
2. No `.env` (raiz), adiciona: `NGROK_AUTHTOKEN=seu_token_aqui`
3. Sobe a stack **com o perfil `tunnel`** (o serviço `ngrok` lê `NGROK_AUTHTOKEN` do mesmo `.env` que a `api`):

```bash
docker compose --profile tunnel up -d
```

4. Vê o URL público HTTPS:
   - **Logs:** `docker compose logs -f ngrok` — aparece a linha `url=https://…`
   - **UI local:** abre `http://localhost:4040` (inspector do ngrok)

Webhook no Asaas: `https://<subdomínio-ngrok>/api/webhooks/asaas/<slug>` (ex. `demo`) + header `asaas-access-token`.

Para **não** arrancar o ngrok, usa só `docker compose up` (sem `--profile tunnel`).

## pgAdmin (interface web ao Postgres)

Serviço opcional com perfil **`pgadmin`**. UI em `http://localhost:5050` (ou o porto definido em `PGADMIN_PORT`).

```bash
docker compose --profile pgadmin up -d
```

- **Login na UI:** email e palavra definidos em `PGADMIN_DEFAULT_EMAIL` e `PGADMIN_DEFAULT_PASSWORD` no `.env` (evita domínios `.local`, que o pgAdmin pode rejeitar).
- **Ligar ao Postgres:** em *Register → Server*, aba *Connection*:
  - **Host:** `db` (nome do serviço no Compose; não uses `localhost` dentro do diálogo do servidor)
  - **Port:** `5432`
  - **Maintenance database:** valor de `POSTGRES_DB` no `.env`
  - **Username / Password:** `POSTGRES_USER` / `POSTGRES_PASSWORD` do `.env`

Podes combinar perfis, por exemplo: `docker compose --profile pgadmin --profile tunnel up -d`.

**Aviso:** não expões o porto `5050` em redes não confiáveis.

### pgAdmin em produção (`docker-compose.prod.yml`)

A imagem oficial **só usa** `PGADMIN_DEFAULT_EMAIL` e `PGADMIN_DEFAULT_PASSWORD` quando cria a base interna pela **primeira vez**. Se o volume `pgadmin_data` já existir (primeira subida com outro `.env` ou defaults do compose), o login **não muda** quando editas o `.env` — continuam válidas as credenciais da primeira instalação.

Para aplicar o email/senha novos do `.env`: `docker compose -f docker-compose.prod.yml stop pgadmin`, apaga o volume que contém `pgadmin_data` (`docker volume ls` para ver o nome completo, ex. `pastadoprojeto_pgadmin_data`), depois `docker compose -f docker-compose.prod.yml up -d`. Isto **apaga só** dados da UI do pgAdmin, não apaga a base Postgres (`pgdata`).

## O que ver nos logs (`docker compose logs -f api`)

O script [`apps/api/docker-entrypoint.sh`](../apps/api/docker-entrypoint.sh) imprime, em ordem:

1. Host da base (sem password) e nome da base
2. Teste de ligação com `prisma db execute` (`SELECT 1`)
3. `prisma migrate deploy` (criação/atualização do schema)
4. Opcionalmente seed, se `RUN_SEED=true`
5. Arranque do processo Node (Nest)

Mensagens começam por `[entrypoint]`.

### Falhas típicas

| Sintoma | Causa provável |
|--------|----------------|
| `password authentication failed` | `DATABASE_URL` não coincide com `POSTGRES_*` do serviço `db` |
| `connection refused` | Postgres ainda a subir ou hostname errado (deve ser `db` dentro do Compose) |
| `P3009` / migração bloqueada | Histórico de migrações inconsistente; rever em ambiente de dev antes de repetir em Docker |
| API reinicia em loop | Ver `docker compose logs api`; erro de `ENCRYPTION_KEY` / `JWT_SECRET` na validação do Nest |

## Seed opcional

`RUN_SEED=true` no `.env` ou override — ver [docker-compose.override.example.yml](../docker-compose.override.example.yml). Não recomendado em produção a cada restart. Detalhe: [README raiz](../README.md#dev-quickstart).

## Compose: ficheiros úteis

| Ficheiro | Uso |
|----------|-----|
| [docker-compose.yml](../docker-compose.yml) | Postgres + API (dev); perfis opcionais `tunnel` (ngrok), `pgadmin` |
| [docker-compose.dev.yml](../docker-compose.dev.yml) | Stack completa no servidor Debian (API + admin + Postgres + pgAdmin); perfil opcional `tunnel` (ngrok); rede `web_gateway` |
| [docker-compose.prod.yml](../docker-compose.prod.yml) | API + Postgres + pgAdmin; variáveis no `.env`. Rede `proxy-network` (NPM) |
| [docker-compose.qa.yml](../docker-compose.qa.yml) | QA no servidor (clone `churchmanager-qa`, branch `qa`); variáveis no `.env` |
| `docker-compose.override.yml` | Opcional, local, ignorado pelo Git |

## Dev no servidor (nginx-gateway)

Para expor `api.churchmanager.local`, `admin.churchmanager.local` e `db.churchmanager.local` através de um nginx central (como no projeto `nginx-gateway` na VPS):

1. Criar a rede partilhada: `docker network create web_gateway`
2. No repositório ChurchManager: copiar [`.env.example`](../.env.example) → `.env`, preencher segredos e `API_URL` para o domínio do gateway
3. Copiar [docker/nginx-gateway/nginx.conf](nginx-gateway/nginx.conf) para `~/workspace/nginx-gateway/nginx.conf` no servidor e recarregar o contentor nginx do gateway
4. DNS ou `/etc/hosts`: os três hostnames apontam para o IP do nginx-gateway
5. Na pasta do projeto: `docker compose -f docker-compose.dev.yml up -d --build`

Portos só em `127.0.0.1` no host (acesso directo opcional): Postgres `5438`, API `4060`, admin `4061`, pgAdmin `5052`, ngrok inspector `4040` (perfil `tunnel`).

**Webhooks Asaas no servidor dev:** define `NGROK_AUTHTOKEN` no `.env` e sobe o túnel:

```bash
docker compose -f docker-compose.dev.yml --profile tunnel up -d
docker compose -f docker-compose.dev.yml logs -f churchmanager-ngrok
```

URL público: `https://<subdomínio-ngrok>/api/webhooks/asaas/<slug>` — ver [webhooks-local-dev-ngrok.md](../docs/webhooks-local-dev-ngrok.md).

No pgAdmin → *Register Server*: Host `churchmanager-postgres`, Port `5432`, credenciais = `POSTGRES_USER` / `POSTGRES_PASSWORD` do `.env`.

## QA (servidor)

Ambiente de testes na VPS, **isolado de produção** com clone Git separado e branch `qa`. Cada pasta tem o seu `.env`, base de dados e volumes Docker próprios.

### Porquê clone + branch (em vez de partilhar a pasta de prod)

| | Clone separado + branch `qa` | Mesma pasta, ficheiro `.env.qa` |
|--|------------------------------|----------------------------------|
| Isolamento | `git pull` em QA não mexe em prod | Risco de checkout na pasta errada |
| Comandos | `docker compose -f docker-compose.qa.yml up` | Sempre `--env-file .env.qa` |
| Branches | QA testa `qa`; prod fica em `main` | Só uma branch de cada vez na pasta |
| Segredos | `.env` distinto em cada clone | Um `.env` de prod + um `.env.qa` na mesma árvore |

### Estrutura na VPS

```
~/projetos/
├── churchmanager/          # branch main  → docker-compose.prod.yml  → .env (prod)
└── churchmanager-qa/       # branch qa    → docker-compose.qa.yml    → .env (valores QA)
```

Volumes Docker (automáticos): `pgdata_qa`, `pgadmin_data_qa` — não partilham dados com produção.

| Serviço Compose | Contentor | Porta localhost | NPM (Forward Hostname) |
|-----------------|-----------|-----------------|------------------------|
| `qa-api` | `churchmanager-qa-api` | `4070` | `churchmanager-qa-api` → 3000 |
| `qa-admin` | `churchmanager-qa-admin` | `4071` | `churchmanager-qa-admin` → 80 |
| `qa-db` | `churchmanager-qa-db` | `5439` | (só interno) |
| `qa-pgadmin` | `churchmanager-qa-pgadmin` | `5053` | `churchmanager-qa-pgadmin` → 80 |

### Setup inicial (uma vez)

```bash
# 1) Clone QA (na VPS)
cd ~/projetos
git clone <url-do-repo> churchmanager-qa
cd churchmanager-qa
git checkout -b qa origin/main   # ou: git checkout qa  (se a branch já existir no remoto)

# 2) Variáveis — copiar template e preencher (segredos NOVOS, não os de prod)
cp .env.qa.example .env
nano .env

# 3) Rede do NPM (partilhada com prod; só criar uma vez)
sudo docker network create proxy-network

# 4) Subir stack (ver aviso abaixo sobre build na VPS)
sudo docker compose -f docker-compose.qa.yml up -d --build
```

> ⚠️ **Não construir imagens na mesma VPS de produção.** O `--build` compila a API
> (NestJS) e o admin (Vite/Rollup) na máquina. Só o build do admin pode consumir
> **>1GB de RAM** e, sem swap/limites, dispara o **OOM killer** — congelando a VPS e
> derrubando a produção que corre ao lado.
>
> **Recomendado:** construir as imagens em CI (ou local), dar push para o GHCR e na VPS
> fazer apenas `pull`. Define `API_IMAGE` e `ADMIN_IMAGE` no `.env` QA e usa:
>
> ```bash
> sudo docker compose -f docker-compose.qa.yml pull
> sudo docker compose -f docker-compose.qa.yml up -d
> ```
>
> **Se mesmo assim precisares de build na VPS:** garante **swap** (`free -h`), constrói
> **um serviço de cada vez** (`build qa-api`, depois `build qa-admin`) e usa
> `ADMIN_BUILD_MEMORY` no `.env` para limitar o heap do Node no build. Os serviços QA já
> têm `mem_limit`/`cpus` em runtime para não sufocar a produção.

No **NPM**, criar Proxy Host com TLS para `admin-qa` (e opcionalmente `api-qa` para webhooks/Insomnia). O painel usa **same-origin**: pedidos vão para `https://admin-qa.../api/...` e o nginx do contentor admin (`docker/admin-qa.nginx.conf`) faz proxy interno para `qa-api`.

No `.env` QA:
```env
API_URL=https://admin-qa.seudominio.com/api
ADMIN_CORS_ORIGIN=https://admin-qa.seudominio.com
ADMIN_WEB_BASE_URL=https://admin-qa.seudominio.com
```

Depois de alterar `API_URL`, rebuild do admin: `docker compose -f docker-compose.qa.yml up -d --build qa-admin`.

### Fluxo de trabalho (branch `qa`)

```bash
# Desenvolver localmente → merge ou push para branch qa
git push origin qa

# Na VPS (clone QA)
cd ~/projetos/churchmanager-qa
git pull origin qa
sudo docker compose -f docker-compose.qa.yml up -d --build

# Quando QA estiver validado → merge qa → main (deploy prod à parte)
```

### Comandos do dia-a-dia (no clone QA)

```bash
cd ~/projetos/churchmanager-qa

# Atualizar usando imagens do GHCR (RECOMENDADO — sem build na VPS)
# Definir API_IMAGE e ADMIN_IMAGE no .env, depois:
git pull origin qa
sudo docker compose -f docker-compose.qa.yml pull
sudo docker compose -f docker-compose.qa.yml up -d

# Alternativa (evitar): rebuild na VPS, um serviço de cada vez para não estourar a RAM
sudo docker compose -f docker-compose.qa.yml build qa-api
sudo docker compose -f docker-compose.qa.yml build qa-admin
sudo docker compose -f docker-compose.qa.yml up -d

# Logs / parar
sudo docker compose -f docker-compose.qa.yml logs -f qa-api
sudo docker compose -f docker-compose.qa.yml down
```

### Variáveis (`.env` no clone QA)

Usa [`.env.qa.example`](../.env.qa.example) como base. Pontos críticos:

| Variável | Notas |
|----------|-------|
| `POSTGRES_*`, `DATABASE_URL` | Base `churchmanager_qa` separada de produção |
| `ENCRYPTION_KEY`, `JWT_SECRET` | **Novos** valores; nunca copiar de prod |
| `API_URL` | URL pública da API com `/api` (usada no build do admin) |
| `ADMIN_CORS_ORIGIN` | URL pública do painel admin |
| `ADMIN_WEB_BASE_URL` | Base das URLs de convite/cadastro (ex.: `https://admin-qa.seudominio.com`). Se omitido, usa `ADMIN_CORS_ORIGIN` |
| `ASAAS_API_URL` | Manter sandbox: `https://api-sandbox.asaas.com/v3` |
| `R2_*` | Bucket ou prefixo dedicado a QA |
| `RUN_SEED` | `true` só na primeira subida; depois remover |
| `API_IMAGE` | Opcional; se definido, puxa imagem do GHCR em vez de build local |
| `ADMIN_IMAGE` | Opcional; imagem do admin no GHCR. Evita compilar o Vite na VPS (principal causa de OOM) |
| `ADMIN_BUILD_MEMORY` | Só se construíres o admin na VPS: limite de heap do Node no build (MB, ex.: 1024) |

Guia completo Cloudflare + NPM + R2: [docs/qa-cloudflare-npm-r2.md](../docs/qa-cloudflare-npm-r2.md).

## Produção

- **Segredos:** não uses `env_file` com passwords em servidores partilhados; preferir secrets do fornecedor (Swarm, Kubernetes, cloud).
- **TLS:** termina HTTPS no reverse proxy; o contentor da API pode servir HTTP internamente.
- **`ADMIN_CORS_ORIGIN`:** só o painel admin / login (ver [architecture.md](../docs/architecture.md) § multitenancy / CORS).
- **Migrações:** `migrate deploy` corre no entrypoint; com várias réplicas, considera um job de deploy dedicado para evitar corridas.
- **Imagem:** tag semântica (`registry/.../api:1.2.3`), não só `latest`.

### VPS: imagem do GHCR e erro `pull access denied for church-manager-api`

O `docker-compose.prod.yml` usa `API_IMAGE` na linha `image:` do serviço `api`. O Compose interpola a partir do ficheiro **`.env`** na raiz do projeto (carregado automaticamente).

Na VPS:

```bash
cd ~/projetos/churchmanager
sudo docker login ghcr.io -u SEU_USUARIO --password-stdin   # token com read:packages

sudo docker compose -f docker-compose.prod.yml pull api
sudo docker compose -f docker-compose.prod.yml up -d api
```

Confirma que `.env` contém `API_IMAGE=ghcr.io/<user>/churchmanager/api:latest` (caminho exacto na aba **Packages** do GitHub).

**Migração:** se ainda tens `.env.production` ou `.env.docker`, une o conteúdo num único `.env` e apaga os ficheiros antigos.

## Build manual da imagem da API

```bash
docker build -t church-manager-api:local ./apps/api
```
