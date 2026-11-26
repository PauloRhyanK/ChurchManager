#!/usr/bin/env bash
# Verifica as migrações do Prisma num Postgres descartável (Docker), sem tocar em nenhum banco real.
#
# Cenários:
#   1. Banco vazio: `prisma migrate deploy` aplica tudo do zero e o banco final bate com o schema.prisma.
#   2. Banco como o de produção: as migrações foram aplicadas na ordem em que chegaram
#      (add_worship_timing antes de lyrics_slide_limits, esta com o SQL original). Depois,
#      `migrate deploy` com a pasta atual aplica só o que falta, sem erro, e o banco bate com o schema.
#
# Uso (de apps/api):  bash scripts/verify-migrations.sh
# Requer: docker e node_modules instalados (npm ci).
set -euo pipefail

cd "$(dirname "$0")/.."
MIGRATIONS=prisma/migrations
PG_IMAGE=${PG_IMAGE:-postgres:15-alpine}   # mesma versão da produção
NAME=cm-verify-migrations-$$
PORT=${VERIFY_PG_PORT:-55432}
TMP=$(mktemp -d)

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=verify -p "$PORT:5432" "$PG_IMAGE" >/dev/null
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1

psql_c() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }
url() { echo "postgresql://postgres:verify@localhost:$PORT/$1"; }

# Monta um schema.prisma temporário apontando para uma pasta de migrações qualquer.
schema_with() { # $1 = pasta de migrações
  mkdir -p "$TMP/$2/prisma"
  cp prisma/schema.prisma "$TMP/$2/prisma/schema.prisma"
  rm -rf "$TMP/$2/prisma/migrations"
  cp -R "$1" "$TMP/$2/prisma/migrations"
  echo "$TMP/$2/prisma/schema.prisma"
}

deploy() { # $1 = banco, $2 = schema
  DATABASE_URL=$(url "$1") npx prisma migrate deploy --schema "$2" 2>&1 | grep -v -i 'deprecated\|pris.ly/prisma-config\|^$'
}

no_drift() { # $1 = banco
  DATABASE_URL=$(url "$1") npx prisma migrate diff \
    --from-url "$(url "$1")" --to-schema-datamodel prisma/schema.prisma --exit-code >/dev/null \
    && echo "OK: $1 bate com o schema.prisma" \
    || { echo "FALHA: $1 difere do schema.prisma"; exit 1; }
}

echo "== Cenário 1: banco vazio"
psql_c -c 'CREATE DATABASE fresh' >/dev/null
deploy fresh "$(schema_with "$MIGRATIONS" fresh)"
no_drift fresh

echo "== Cenário 2: banco aplicado na ordem da produção"
psql_c -c 'CREATE DATABASE prodlike' >/dev/null
# 2a. Tudo que existia antes, menos lyrics_slide_limits e a migração nova de reforço.
mkdir -p "$TMP/old"
cp -R "$MIGRATIONS" "$TMP/old/migrations"
rm -rf "$TMP/old/migrations/20261122120000_lyrics_slide_limits" \
       "$TMP/old/migrations/20261123120100_worship_settings_lyric_limits"
deploy prodlike "$(schema_with "$TMP/old/migrations" prod_a)"
# 2b. lyrics_slide_limits com o SQL original (o que a produção aplicou em 22/11/2026).
mkdir -p "$TMP/old/migrations/20261122120000_lyrics_slide_limits"
cat > "$TMP/old/migrations/20261122120000_lyrics_slide_limits/migration.sql" <<'SQL'
ALTER TABLE "worship_settings"
  ADD COLUMN "lyric_max_chars" INTEGER NOT NULL DEFAULT 28,
  ADD COLUMN "lyric_max_lines" INTEGER NOT NULL DEFAULT 3;
SQL
deploy prodlike "$(schema_with "$TMP/old/migrations" prod_b)"
# 2c. Pasta atual: só a migração de reforço deve ser aplicada.
deploy prodlike "$(schema_with "$MIGRATIONS" prod_c)"
no_drift prodlike
psql_c -d prodlike -c "SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%lyric%' ORDER BY started_at"

echo "Tudo certo."
