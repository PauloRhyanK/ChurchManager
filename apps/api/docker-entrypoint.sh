#!/bin/sh
set -e

log() {
  printf '%s\n' "[entrypoint] $*"
}

if [ -n "$DATABASE_URL" ]; then
  node -e "
    try {
      const u = new URL(process.env.DATABASE_URL);
      const db = decodeURIComponent(u.pathname || '').replace(/^\//, '') || '(default)';
      console.log('[entrypoint] Host da base:', u.hostname, '| nome:', db);
    } catch {
      console.log('[entrypoint] DATABASE_URL definida (formato não mostrado).');
    }
  " 2>/dev/null || log "DATABASE_URL definida."
else
  log "ERRO: DATABASE_URL não definida."
  exit 1
fi

log "A testar ligação ao PostgreSQL…"
if ! printf '%s\n' "SELECT 1" | npx prisma db execute --stdin --schema prisma/schema.prisma; then
  log "ERRO: não foi possível ligar ou executar SQL na base. Verifique DATABASE_URL e se o Postgres aceita ligações."
  exit 1
fi
log "Ligação à base de dados OK."

log "A aplicar migrações (prisma migrate deploy)…"
if npx prisma migrate deploy --schema prisma/schema.prisma; then
  log "Migrações aplicadas com sucesso."
else
  log "ERRO: prisma migrate deploy falhou."
  exit 1
fi

if [ "$RUN_SEED" = "true" ]; then
  log "A executar seed…"
  npx tsx prisma/seed.ts
  log "Seed concluído."
fi

log "A iniciar a aplicação Nest…"
exec node dist/main.js
