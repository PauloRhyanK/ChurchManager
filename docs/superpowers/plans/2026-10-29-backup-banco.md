# Backup do banco de produção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda madrugada a stack de produção exporta o Postgres para uma pasta do host, e a rotina de backup de arquivos da Locaweb copia essa pasta (mais os segredos e o proxy) para fora da VPS.

**Architecture:** Um serviço novo `db-backup` no `docker-compose.prod.yml`, com a mesma imagem do banco (`postgres:15-alpine`, garante `pg_dump` da mesma versão), roda `docker/backup/pg-backup.sh` via `crond` às 02:00 (São Paulo) e uma vez ao subir. O script grava `pg_dump -Fc` em arquivo temporário, valida com `pg_restore --list`, renomeia e só então apaga dumps antigos. A pasta de saída é um bind mount fora do repositório (`/root/backups/churchmanager`), então `git pull`, deploy da API e `docker image prune` não a tocam.

**Tech Stack:** POSIX sh (busybox), Docker Compose, PostgreSQL 15 (`pg_dump`/`pg_restore`), rotina de backup do painel Locaweb.

**Spec:** sem spec escrita — pedido do usuário em 29/10/2026: "o app, de madrugada, exporta o banco para a rotina de backup de arquivos da VPS copiar; extrair o que precisa ser salvo mesmo com atualizações; dizer o que configurar na VPS".

## O que existe hoje (levantado na VPS em 29/10/2026)

- Banco `churchmanager_db` ≈ 11 MB (dump `-Fc` ≈ 200 KB). Volume `churchmanager_pgdata`. Nenhum cron/timer de backup; só dumps manuais soltos em `/root` e um `.sql` antigo dentro do repo.
- Imagens enviadas pelo painel ficam no **Cloudflare R2** (`StorageService`), não na VPS — fora do escopo do backup de arquivos.
- Fora do git e impossível de recriar: `/root/projetos/churchmanager/.env.production` (o `.env` é symlink para ele). Contém `ENCRYPTION_KEY`: **sem ela os campos criptografados do banco (chaves Asaas) ficam ilegíveis mesmo com o dump.**
- `/root/infra/proxy` (`data` + `letsencrypt`) é o Nginx Proxy Manager de todos os domínios da VPS.
- Disco: 14 GB livres. Fuso do host America/Sao_Paulo; relógio **não sincronizado** (`timedatectl`).

## Global Constraints

- Imagem do serviço: `postgres:15-alpine` (igual ao `db`; não usar 16).
- Saída no host: `/root/backups/churchmanager`; nome `churchmanager-AAAAMMDD-HHMMSS.dump`.
- Horário: `0 2 * * *` com `TZ=America/Sao_Paulo`, mais uma execução ao subir o contêiner.
- Retenção local: `BACKUP_KEEP_DAYS` (padrão `14`); só arquivos `churchmanager-*.dump`, só depois de um dump novo válido.
- O serviço recebe só `PGHOST/PGUSER/PGPASSWORD/PGDATABASE` (interpolados do `.env`), nunca `env_file: .env`.
- Mensagens de log e documentação em pt-BR.
- Trabalho entra pela `qa` (branch `feat/backup-banco` a partir de `origin/qa`); push na `main` = produção. O deploy automático está quebrado desde jul/2026 — o passo na VPS é manual.

## Review Focus

- Dump falha no meio (senha errada, banco fora) → script sai ≠ 0, não deixa `.dump` novo nem `.partial`, e **não apaga** nenhum dump antigo. Teste na Task 1.
- Retenção apaga só `churchmanager-*.dump` mais velhos que o limite; arquivos manuais (`backup-prod-*.dump`) e recentes ficam. Teste na Task 1.
- Dump gerado restaura de verdade (não só "existe"). Teste na Task 1 (`pg_restore` num banco vazio) e ensaio na Task 3.
- Agendamento em horário de São Paulo, não UTC, e saída do cron visível em `docker logs`. Verificação na Task 3.
- Deploy da API (`up -d api` + `image prune -f`) e `git pull` não derrubam o `db-backup` nem mexem em `/root/backups`. Verificação na Task 3.

---

### Task 1: Script `pg-backup.sh` com teste de integração

**Files:**
- Create: `docker/backup/pg-backup.sh` (executável, LF)
- Test: `docker/backup/test-pg-backup.sh` (executável, LF)

**Interfaces:**
- Produces: `pg-backup.sh` sem argumentos. Lê `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `BACKUP_DIR` (padrão `/backups`), `BACKUP_KEEP_DAYS` (padrão `14`). Exit 0 = dump novo validado em `$BACKUP_DIR/churchmanager-AAAAMMDD-HHMMSS.dump`; exit ≠ 0 = nada criado, nada apagado. Toda linha de log prefixada `[backup] AAAA-MM-DD HH:MM:SS`.

- [ ] **Step 1: Escrever o teste** `docker/backup/test-pg-backup.sh` (roda no Mac/Linux com Docker; `set -eu`; limpa tudo num `trap ... EXIT`):
  - Cria rede `cm-backup-test`, sobe `postgres:15-alpine` (`cm-backup-test-db`, senha `teste123`, banco `churchmanager_db`), espera `pg_isready`, cria `CREATE TABLE igreja(id int); INSERT INTO igreja VALUES (1),(2);`.
  - Helper `run_backup <senha>`: `docker run --rm --network cm-backup-test -v "$TMP:/backups" -v "$PWD/docker/backup:/scripts:ro" -e PGHOST=cm-backup-test-db -e PGUSER=postgres -e PGPASSWORD=<senha> -e PGDATABASE=churchmanager_db postgres:15-alpine /scripts/pg-backup.sh`.
  - Preparo (dentro de um contêiner alpine com o `$TMP` montado, para `touch -d` ser igual em qualquer SO): `churchmanager-20200101-020000.dump` com mtime de 20 dias atrás; `churchmanager-recente.dump` com mtime de 1 dia; `backup-prod-manual.dump` com mtime de 20 dias.
  - Caso `falha_nao_apaga`: `run_backup errada` → exit ≠ 0; os três arquivos continuam; nenhum `*.partial`; nenhum dump com data de hoje.
  - Caso `sucesso`: `run_backup teste123` → exit 0; existe exatamente um `churchmanager-$(date +%Y%m%d)-*.dump`; `pg_restore --list` nele lista `TABLE public igreja`.
  - Caso `retencao`: depois do sucesso, `churchmanager-20200101-020000.dump` sumiu; `churchmanager-recente.dump` e `backup-prod-manual.dump` ficaram.
  - Caso `restaura`: `createdb restore_teste` + `pg_restore -d restore_teste <dump novo>` + `psql -Atc 'select count(*) from igreja'` = `2`.
  - Imprime `OK: <caso>` por caso e `TODOS OS TESTES PASSARAM` no fim.

- [ ] **Step 2: Rodar e ver falhar**

Run: `sh docker/backup/test-pg-backup.sh`
Expected: falha no primeiro caso porque `/scripts/pg-backup.sh` não existe.

- [ ] **Step 3: Implementar `docker/backup/pg-backup.sh`**

`#!/bin/sh` + `set -eu`. Ordem fixa (é ela que garante a Review Focus):
1. `mkdir -p "$BACKUP_DIR"`; `final=$BACKUP_DIR/churchmanager-$(date +%Y%m%d-%H%M%S).dump`; `tmp=$final.partial`; `trap 'rm -f "$tmp"' EXIT`.
2. `pg_dump -Fc --no-owner --no-acl -f "$tmp"` — em erro, logar `[backup] ERRO: pg_dump falhou` e `exit 1`.
3. `pg_restore --list "$tmp" >/dev/null` — em erro, logar `ERRO: dump inválido` e `exit 1`.
4. `mv "$tmp" "$final"`; logar `dump OK: <arquivo> (<tamanho via du -h>)`.
5. `find "$BACKUP_DIR" -maxdepth 1 -name 'churchmanager-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -print -delete` com cada removido logado como `removido: <arquivo>`.

- [ ] **Step 4: Rodar e ver passar**

Run: `sh docker/backup/test-pg-backup.sh`
Expected: `OK:` para os quatro casos e `TODOS OS TESTES PASSARAM`; exit 0.

- [ ] **Step 5: Commit**

```bash
git add --chmod=+x docker/backup/pg-backup.sh docker/backup/test-pg-backup.sh
git commit -m "feat(backup): script de dump diário do Postgres com teste"
```

---

### Task 2: Serviço `db-backup` no compose de produção + runbook

**Files:**
- Modify: `docker-compose.prod.yml` (novo serviço depois de `db`)
- Create: `docs/backup.md`
- Modify: `README.md` (link `[backup](docs/backup.md)` na linha "Documentação extra")

**Interfaces:**
- Consumes: `docker/backup/pg-backup.sh` (Task 1).
- Produces: contêiner `churchmanager_db_backup`; dumps em `/root/backups/churchmanager` no host.

- [ ] **Step 1: Adicionar o serviço** com estes valores:
  - `image: postgres:15-alpine`, `container_name: churchmanager_db_backup`, `restart: unless-stopped`, `depends_on: [db]`, rede só `default`.
  - `environment`: `TZ: America/Sao_Paulo`, `PGHOST: db`, `PGUSER: ${POSTGRES_USER:-postgres}`, `PGPASSWORD: ${POSTGRES_PASSWORD:?Defina POSTGRES_PASSWORD}`, `PGDATABASE: ${POSTGRES_DB:-churchmanager_db}`, `BACKUP_DIR: /backups`, `BACKUP_KEEP_DAYS: "14"`.
  - `volumes`: `./docker/backup:/scripts:ro` e `/root/backups/churchmanager:/backups`.
  - `entrypoint: ["/bin/sh", "-c"]`, `command`: espera `pg_isready` (até 30 tentativas de 2 s), roda `/scripts/pg-backup.sh` uma vez (falha só loga, não derruba), grava `0 2 * * * /scripts/pg-backup.sh >> /proc/1/fd/1 2>&1` em `/etc/crontabs/root` e faz `exec crond -f -l 8`.
  - `healthcheck`: `find /backups -maxdepth 1 -name 'churchmanager-*.dump' -mmin -1560 | grep -q .` (um dump com menos de 26 h), `interval: 1h`, `start_period: 5m`.
  - Comentário de 2–3 linhas no topo do serviço apontando para `docs/backup.md`.

- [ ] **Step 2: Validar o compose**

Run: `API_IMAGE=x POSTGRES_PASSWORD=x docker compose -f docker-compose.prod.yml config --services`
Expected: lista contém `db-backup`; sem erro de interpolação.

- [ ] **Step 3: Escrever `docs/backup.md`** (pt-BR), seções:
  - **O que é salvo e onde** — tabela: dumps (`/root/backups/churchmanager`, diário 02:00, 14 dias locais); `.env.production` (manual, contém `ENCRYPTION_KEY`); `/root/infra/proxy`; imagens no R2 (fora deste backup).
  - **Rotina na Locaweb** — os valores da seção "Configuração no painel" deste plano.
  - **Verificar** — `docker logs --tail 20 churchmanager_db_backup`, `docker ps` (status `healthy`), `ls -lh /root/backups/churchmanager`.
  - **Rodar agora** — `docker exec churchmanager_db_backup /scripts/pg-backup.sh`.
  - **Restaurar** — ensaio sem tocar produção (`createdb restore_teste` + `pg_restore` dentro do `churchmanager_db`, contar linhas, `dropdb`) e restauração real (parar `api`, `pg_restore --clean --if-exists -d churchmanager_db`, subir `api`), sempre com `</dev/null` em `docker compose exec -T` dentro de `ssh ... bash -s`.
  - **Importante** — restaurar exige o `.env.production` com a mesma `ENCRYPTION_KEY`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml docs/backup.md README.md
git commit -m "feat(backup): serviço db-backup no compose de produção e runbook"
```

---

### Task 3: Subir na VPS e ensaiar restauração (precisa do OK do usuário)

**Files:** nenhum no repo. Pré-requisito: Tasks 1–2 em `qa` → PR para `main` aprovado e mergeado.

- [ ] **Step 1: Preparar o host** (`ssh paraiso`):

```bash
mkdir -p /root/backups/churchmanager && chmod 700 /root/backups
mv /root/backup-prod-*.dump /root/backups/churchmanager/
timedatectl set-ntp true
```

Expected: `timedatectl` mostra `System clock synchronized: yes` (pode levar 1–2 min). Os dumps manuais movidos não seguem o padrão `churchmanager-*` e por isso nunca são apagados pela retenção.

- [ ] **Step 2: Atualizar e subir só o serviço novo**

```bash
cd ~/projetos/churchmanager && git pull --ff-only origin main && docker compose -f docker-compose.prod.yml up -d db-backup
```

Expected: `docker logs churchmanager_db_backup` mostra `[backup] ... dump OK: /backups/churchmanager-2026...dump`; `ls /root/backups/churchmanager` mostra o arquivo; `docker exec churchmanager_db_backup date` mostra horário `-03`. Os contêineres `api` e `db` **não** são recriados (conferir `docker ps` → "Up" com o tempo de antes).

- [ ] **Step 3: Ensaio de restauração** (seção "Restaurar → ensaio" do `docs/backup.md`)

Expected: `select count(*) from tenants` no `restore_teste` igual ao de `churchmanager_db` (e o mesmo para `events`) igual à de `churchmanager_db`; `dropdb restore_teste` no fim.

- [ ] **Step 4: Conferir que deploy não afeta**

Run: `docker compose -f docker-compose.prod.yml up -d api && docker image prune -f && docker ps --filter name=churchmanager_db_backup`
Expected: `churchmanager_db_backup` continua `Up`. Na manhã seguinte: um dump com horário `02:00` e status `healthy`.

- [ ] **Step 5: Atualizar a memória** `vps-prod-acesso` com a pasta de backup e o contêiner.

---

## Configuração no painel da Locaweb ("Criar rotina de backup")

| Campo | Valor |
|---|---|
| Identificação da rotina | `churchmanager-producao` |
| Frequência | Diária |
| Incluir | `/root/backups/churchmanager` |
| Incluir | `/root/projetos/churchmanager/.env.production` (se o campo só aceitar pasta: `/root/projetos/churchmanager` e **Excluir** `/root/projetos/churchmanager/.git`) |
| Incluir | `/root/infra/proxy` |
| E-mail | o seu |
| Quando houver erro | ✅ |
| Quando gerado com sucesso | opcional (gera um e-mail por dia) |

**Não incluir** `/var/lib/docker`: copiar os arquivos do Postgres com o banco ligado gera cópia inconsistente — o dump é o backup do banco. Se a Locaweb rodar antes das 02:00, ela copia o dump da véspera; nada se perde, só fica um dia atrás.
