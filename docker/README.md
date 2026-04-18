# Docker (Postgres + API)

Stack de **desenvolvimento local** com PostgreSQL e a API Nest em contentores. Em **produção**, costuma-se usar Postgres gerido e a mesma imagem da API com variáveis injectadas pelo CI/CD ou orquestrador — ver secção [Produção](#produção).

Ordem geral e variáveis (admin + API + 404): **[README na raiz — Início rápido](../README.md#dev-quickstart)**.

## Pré-requisitos

- Docker e Docker Compose v2
- Ficheiro `.env.docker` na **raiz do repositório** (não commitado), criado a partir de [`.env.docker.example`](../.env.docker.example)

## Arranque rápido (Compose)

Na raiz do monorepo:

```bash
cp .env.docker.example .env.docker
# Editar .env.docker: ENCRYPTION_KEY (64 hex), JWT_SECRET (≥32 caracteres), etc.

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
2. No `.env.docker` (raiz), adiciona: `NGROK_AUTHTOKEN=seu_token_aqui`
3. Sobe a stack **com o perfil `tunnel`** (o serviço `ngrok` lê `NGROK_AUTHTOKEN` a partir do mesmo `.env.docker` que a `api`):

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

- **Login na UI:** email e palavra por defeito `admin@example.com` / `admin`, a menos que definas `PGADMIN_DEFAULT_EMAIL` e `PGADMIN_DEFAULT_PASSWORD` no `.env.docker` (evita domínios `.local`, que o pgAdmin pode rejeitar).
- **Ligar ao Postgres:** em *Register → Server*, aba *Connection*:
  - **Host:** `db` (nome do serviço no Compose; não uses `localhost` dentro do diálogo do servidor)
  - **Port:** `5432`
  - **Maintenance database:** `church_manager`
  - **Username:** `church`
  - **Password:** `church` (igual ao `POSTGRES_PASSWORD` do serviço `db` no `docker-compose.yml`)

Podes combinar perfis, por exemplo: `docker compose --profile pgadmin --profile tunnel up -d`.

**Aviso:** credenciais fracas por defeito; muda-as no `.env.docker` e não expões o porto `5050` em redes não confiáveis.

### pgAdmin em produção (`docker-compose.prod.yml`)

A imagem oficial **só usa** `PGADMIN_DEFAULT_EMAIL` e `PGADMIN_DEFAULT_PASSWORD` quando cria a base interna pela **primeira vez**. Se o volume `pgadmin_data` já existir (primeira subida com outro `.env` ou defaults do compose), o login **não muda** quando editas o `.env.production` — continuam válidas as credenciais da primeira instalação (por exemplo `admin@example.com` / `admin` se foi isso que correu na altura).

Para aplicar o email/senha novos do `.env.production`: `docker compose -f docker-compose.prod.yml stop pgadmin`, apaga o volume que contém `pgadmin_data` (`docker volume ls` para ver o nome completo, ex. `pastadoprojeto_pgadmin_data`), depois `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`. Isto **apaga só** dados da UI do pgAdmin (servidores guardados no pgAdmin, etc.), não apaga a base Postgres (`pgdata`).

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

`RUN_SEED=true` no `.env.docker` ou override — ver [docker-compose.override.example.yml](../docker-compose.override.example.yml). Não recomendado em produção a cada restart. Detalhe: [README raiz](../README.md#dev-quickstart).

## Compose: ficheiros úteis

| Ficheiro | Uso |
|----------|-----|
| [docker-compose.yml](../docker-compose.yml) | Postgres + API (dev); perfis opcionais `tunnel` (ngrok), `pgadmin` |
| [docker-compose.prod.yml](../docker-compose.prod.yml) | API + Postgres + pgAdmin; `POSTGRES_*` no [`.env.production.example`](../.env.production.example); arranque com `--env-file .env.production`. Rede `proxy-network` (NPM) |
| `docker-compose.override.yml` | Opcional, local, ignorado pelo Git |

## Produção

- **Segredos:** não uses `env_file` com passwords em servidores partilhados; preferir secrets do fornecedor (Swarm, Kubernetes, cloud).
- **TLS:** termina HTTPS no reverse proxy; o contentor da API pode servir HTTP internamente.
- **`ADMIN_CORS_ORIGIN`:** só o painel admin / login (ver [architecture.md](../docs/architecture.md) § multitenancy / CORS).
- **Migrações:** `migrate deploy` corre no entrypoint; com várias réplicas, considera um job de deploy dedicado para evitar corridas.
- **Imagem:** tag semântica (`registry/.../api:1.2.3`), não só `latest`.

### VPS: imagem do GHCR e erro `pull access denied for church-manager-api`

O `docker-compose.prod.yml` usa `API_IMAGE` na linha `image:` do serviço `api`. O Compose **só** substitui essa variável a partir de:

1. Variáveis exportadas no shell antes do comando, ou  
2. Ficheiro passado com **`--env-file .env.production`**, ou  
3. Ficheiro **`.env`** na mesma pasta (nome fixo; **não** é o `.env.production`).

O bloco `env_file: .env.production` **não** alimenta a interpolação do `image:` — só injeta variáveis **dentro** do contentor.

Por isso, na Locaweb, usa sempre:

```bash
cd ~/projetos/churchmanager
sudo docker login ghcr.io -u SEU_USUARIO --password-stdin   # token com read:packages

sudo docker compose --env-file .env.production -f docker-compose.prod.yml pull api
sudo docker compose --env-file .env.production -f docker-compose.prod.yml up -d api
```

Confirma que `.env.production` contém `API_IMAGE=ghcr.io/<user>/churchmanager/api:latest` (caminho exacto na aba **Packages** do GitHub). Sem `--env-file`, o Compose antigo caía no nome local `church-manager-api:latest` e o `pull` falhava.

**`sudo`:** se definires `API_IMAGE` só no utilizador normal, `sudo` não a herda; `--env-file` resolve porque lê o ficheiro como root.

## Build manual da imagem da API

```bash
docker build -t church-manager-api:local ./apps/api
```
