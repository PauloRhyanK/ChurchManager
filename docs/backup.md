# Backup do banco (produção)

O serviço `db-backup` (contêiner `churchmanager_db_backup`, definido em `docker-compose.prod.yml`) roda `pg_dump` todo dia às 02:00 (America/Sao_Paulo) e uma vez a cada subida do contêiner. O script é `docker/backup/pg-backup.sh`: gera o dump, valida com `pg_restore --list` e só então apaga dumps com mais de 14 dias. Se o dump falhar, nada é apagado.

## O que é salvo e onde

| O quê | Onde | Frequência / retenção |
|---|---|---|
| Dumps do Postgres (`churchmanager-AAAAMMDD-HHMMSS.dump`) | `/root/backups/churchmanager` (VPS) | Diário às 02:00; 14 dias locais |
| `.env.production` (contém `ENCRYPTION_KEY`) | `/root/projetos/churchmanager/.env.production` | Manual, pela rotina da Locaweb |
| Configuração do proxy | `/root/infra/proxy` | Pela rotina da Locaweb |
| Imagens enviadas pelo painel | Cloudflare R2 | Fora deste backup |

## Rotina na Locaweb ("Criar rotina de backup")

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

## Verificar

```bash
docker logs --tail 20 churchmanager_db_backup   # procure "[backup] ... dump OK"
docker ps --filter name=churchmanager_db_backup # status deve ser "healthy"
ls -lh /root/backups/churchmanager
```

O healthcheck fica `healthy` quando existe um dump com menos de 26 horas. Se ficar `unhealthy`, o último backup falhou ou não rodou.

## Rodar agora

```bash
docker exec churchmanager_db_backup /scripts/pg-backup.sh
```

## Restaurar

Na VPS, em `/root/projetos/churchmanager`. Escolha o dump em `/root/backups/churchmanager` (exemplo: `churchmanager-20261029-020000.dump`).

Ao rodar estes comandos via `ssh ... bash -s`, use sempre `</dev/null` em `docker compose exec -T` (senão ele consome o resto do script pela entrada padrão).

### Ensaio (não toca a produção)

Restaura em um banco temporário `restore_teste` dentro do `churchmanager_db` e compara contagens.

```bash
DUMP=/root/backups/churchmanager/churchmanager-20261029-020000.dump
source .env.production   # POSTGRES_USER

docker cp "$DUMP" churchmanager_db:/tmp/restore.dump
docker exec churchmanager_db createdb -U "${POSTGRES_USER}" restore_teste
docker exec churchmanager_db pg_restore -U "${POSTGRES_USER}" --no-owner -d restore_teste /tmp/restore.dump

# As contagens devem ser iguais (ou a de restore_teste um pouco menor, se o dump for antigo)
for t in tenants events; do
  docker exec churchmanager_db psql -U "${POSTGRES_USER}" -d restore_teste -tAc "select '$t', count(*) from $t"
  docker exec churchmanager_db psql -U "${POSTGRES_USER}" -d churchmanager_db -tAc "select '$t', count(*) from $t"
done

docker exec churchmanager_db dropdb -U "${POSTGRES_USER}" restore_teste
docker exec churchmanager_db rm /tmp/restore.dump
```

### Restauração real

Substitui os dados atuais pelos do dump. Tudo o que foi gravado depois do dump é perdido.

```bash
DUMP=/root/backups/churchmanager/churchmanager-20261029-020000.dump
source .env.production

docker compose -f docker-compose.prod.yml stop api </dev/null
docker cp "$DUMP" churchmanager_db:/tmp/restore.dump
docker exec churchmanager_db pg_restore -U "${POSTGRES_USER}" --clean --if-exists --no-owner -d churchmanager_db /tmp/restore.dump
docker exec churchmanager_db rm /tmp/restore.dump
docker compose -f docker-compose.prod.yml up -d api </dev/null
```

Depois, confira `docker logs --tail 50` da `api` e o painel.

## Importante

Restaurar exige o `.env.production` com a **mesma `ENCRYPTION_KEY`** de quando o dump foi feito: sem ela, os segredos criptografados dentro do banco (por exemplo, credenciais de integrações) não podem ser lidos. Guarde esse arquivo (a rotina da Locaweb cobre isso).
