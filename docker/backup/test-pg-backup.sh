#!/bin/sh
# Teste de integração do pg-backup.sh. Rode da raiz do repositório: sh docker/backup/test-pg-backup.sh
set -eu

IMG=postgres:15-alpine
NET=cm-backup-test
DB=cm-backup-test-db
ROOT=$(pwd)
mkdir -p "$ROOT/.superpowers"
TMP=$(mktemp -d "$ROOT/.superpowers/backup-test.XXXXXX")

cleanup() {
  docker rm -f "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  # arquivos criados pelos contêineres podem pertencer ao root
  docker run --rm -v "$TMP:/backups" alpine sh -c 'rm -rf /backups/* /backups/.[!.]*' >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

falhou() { echo "FALHOU: $1" >&2; exit 1; }

# no contêiner, para independer do SO do host
ctr() { docker run --rm -v "$TMP:/backups" alpine sh -c "$1"; }

run_backup() {
  docker run --rm --network "$NET" -v "$TMP:/backups" -v "$ROOT/docker/backup:/scripts:ro" \
    -e PGHOST="$DB" -e PGUSER=postgres -e PGPASSWORD="$1" -e PGDATABASE=churchmanager_db \
    "$IMG" /scripts/pg-backup.sh
}

psql_db() { docker exec -e PGPASSWORD=teste123 "$DB" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

docker network rm "$NET" >/dev/null 2>&1 || true
docker rm -f "$DB" >/dev/null 2>&1 || true
docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD=teste123 -e POSTGRES_DB=churchmanager_db "$IMG" >/dev/null

i=0
until docker exec "$DB" pg_isready -U postgres -d churchmanager_db >/dev/null 2>&1 \
  && psql_db -d churchmanager_db -Atc 'select 1' >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -le 60 ] || falhou "banco não ficou pronto"
  sleep 1
done
psql_db -d churchmanager_db -c 'CREATE TABLE igreja(id int); INSERT INTO igreja VALUES (1),(2);' >/dev/null

ctr '
  d=$((24*3600)); now=$(date +%s)
  : > /backups/churchmanager-20200101-020000.dump; touch -d "@$((now - 20*d))" /backups/churchmanager-20200101-020000.dump
  : > /backups/churchmanager-recente.dump;        touch -d "@$((now - 1*d))"  /backups/churchmanager-recente.dump
  : > /backups/backup-prod-manual.dump;           touch -d "@$((now - 20*d))" /backups/backup-prod-manual.dump
'

# --- falha_nao_apaga ---
if run_backup errada >/dev/null 2>&1; then falhou "falha_nao_apaga: backup com senha errada retornou 0"; fi
ctr '
  for f in churchmanager-20200101-020000.dump churchmanager-recente.dump backup-prod-manual.dump; do
    [ -f /backups/$f ] || { echo "sumiu $f"; exit 1; }
  done
  ls /backups/*.partial >/dev/null 2>&1 && { echo "sobrou .partial"; exit 1; }
  ls /backups/churchmanager-$(date +%Y%m%d)-*.dump >/dev/null 2>&1 && { echo "dump de hoje existe"; exit 1; }
  exit 0
' || falhou "falha_nao_apaga"
echo "OK: falha_nao_apaga"

# --- sucesso ---
run_backup teste123 || falhou "sucesso: backup retornou erro"
ctr 'ls /backups/churchmanager-$(date +%Y%m%d)-*.dump' > "$TMP/.lista" 2>/dev/null || falhou "sucesso: nenhum dump de hoje"
[ "$(wc -l < "$TMP/.lista" | tr -d ' ')" = 1 ] || falhou "sucesso: esperado exatamente um dump de hoje"
NOVO=$(basename "$(cat "$TMP/.lista")")
rm -f "$TMP/.lista"
docker run --rm -v "$TMP:/backups" "$IMG" pg_restore --list "/backups/$NOVO" | grep -q 'TABLE public igreja' \
  || falhou "sucesso: dump não lista TABLE public igreja"
echo "OK: sucesso"

# --- retencao ---
ctr '
  [ ! -e /backups/churchmanager-20200101-020000.dump ] || { echo "antigo não foi removido"; exit 1; }
  [ -f /backups/churchmanager-recente.dump ] || { echo "recente sumiu"; exit 1; }
  [ -f /backups/backup-prod-manual.dump ] || { echo "manual sumiu"; exit 1; }
' || falhou "retencao"
echo "OK: retencao"

# --- restaura ---
docker cp "$TMP/$NOVO" "$DB:/tmp/novo.dump"
docker exec -e PGPASSWORD=teste123 "$DB" createdb -U postgres restore_teste
docker exec -e PGPASSWORD=teste123 "$DB" pg_restore -U postgres -d restore_teste /tmp/novo.dump
N=$(docker exec -e PGPASSWORD=teste123 "$DB" psql -U postgres -d restore_teste -Atc 'select count(*) from igreja')
[ "$N" = 2 ] || falhou "restaura: esperado 2 linhas, veio '$N'"
echo "OK: restaura"

echo "TODOS OS TESTES PASSARAM"
