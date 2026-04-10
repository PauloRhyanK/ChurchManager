# Docker (Postgres + API)

Stack de **desenvolvimento local** com PostgreSQL e a API Nest em contentores. Em **produção**, costuma-se usar Postgres gerido e a mesma imagem da API com variáveis injectadas pelo CI/CD ou orquestrador — ver secção [Produção](#produção).

## Pré-requisitos

- Docker e Docker Compose v2
- Ficheiro `.env.docker` na **raiz do repositório** (não commitado), criado a partir de [`.env.docker.example`](../.env.docker.example)

## Arranque rápido

Na raiz do monorepo:

```bash
cp .env.docker.example .env.docker
# Editar .env.docker: ENCRYPTION_KEY (64 hex), JWT_SECRET (≥32 caracteres), etc.

docker compose build
docker compose up
```

- API: `http://localhost:3000/api`
- Health: `GET http://localhost:3000/api/health` — usado pelo healthcheck do contentor

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

## Seed opcional (desenvolvimento)

No compose de desenvolvimento, podes definir `RUN_SEED=true` (variável no `.env.docker` ou em `docker-compose.override.yml`). **Não** recomendado em produção em cada restart.

Podes usar o modelo [docker-compose.override.example.yml](../docker-compose.override.example.yml).

## Compose: ficheiros úteis

| Ficheiro | Uso |
|----------|-----|
| [docker-compose.yml](../docker-compose.yml) | Postgres + API (dev) |
| [docker-compose.prod.yml](../docker-compose.prod.yml) | Exemplo: só API (imagem pré-construída, `DATABASE_URL` externo) |
| `docker-compose.override.yml` | Opcional, local, ignorado pelo Git |

## Produção

- **Segredos:** não uses `env_file` com passwords em servidores partilhados; preferir secrets do fornecedor (Swarm, Kubernetes, cloud).
- **TLS:** termina HTTPS no reverse proxy; o contentor da API pode servir HTTP internamente.
- **`ADMIN_CORS_ORIGIN`:** lista explícita de origens HTTPS do painel.
- **Migrações:** `migrate deploy` corre no entrypoint; com várias réplicas, considera um job de deploy dedicado para evitar corridas.
- **Imagem:** tag semântica (`registry/.../api:1.2.3`), não só `latest`.

## Build manual da imagem da API

```bash
docker build -t church-manager-api:local ./apps/api
```
