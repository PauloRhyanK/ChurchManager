#!/bin/sh
# Dump diário do Postgres do ChurchManager.
# Env: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14).
# Exit 0 = dump novo validado; exit != 0 = nada criado e nada apagado.
set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

if ! mkdir -p "$BACKUP_DIR"; then
  log "ERRO: não foi possível criar $BACKUP_DIR"
  exit 1
fi
final=$BACKUP_DIR/churchmanager-$(date +%Y%m%d-%H%M%S).dump
tmp=$final.partial
trap 'rm -f "$tmp"' EXIT

log "iniciando dump de ${PGDATABASE:-?} em ${PGHOST:-?}"
if ! pg_dump -Fc --no-owner --no-acl -f "$tmp"; then
  log "ERRO: pg_dump falhou"
  exit 1
fi

if ! pg_restore --list "$tmp" >/dev/null; then
  log "ERRO: dump inválido"
  exit 1
fi

mv "$tmp" "$final"
log "dump OK: $final ($(du -h "$final" | cut -f1))"

# Retenção: só depois de um dump novo e válido; só arquivos churchmanager-*.dump.
rc=0
removidos=$(find "$BACKUP_DIR" -maxdepth 1 -name 'churchmanager-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -print -delete) || rc=$?
if [ -n "$removidos" ]; then
  echo "$removidos" | while IFS= read -r f; do log "removido: $f"; done
fi
if [ "$rc" -ne 0 ]; then
  log "ERRO: retenção falhou"
  exit 1
fi
