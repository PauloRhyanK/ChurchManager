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
