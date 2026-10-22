# AGENTS.md — ChurchManager

## Estrutura
- `apps/api` — NestJS + Prisma (PostgreSQL).
- `apps/admin` — painel React + Vite + shadcn/ui.
- O site público fica em **outro repositório** e consome a API via HTTP (ADR 0002). O painel é fornecedor de dados e não conhece o site.
- Como subir localmente: ver `README.md`.

## Gates (todos com exit 0 antes de commitar)
- API: `cd apps/api && npm ci && npx prisma generate && npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
- Admin: `cd apps/admin && npm ci && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run && npm run build`

A API não tem ESLint. Avisos (warnings) de lint no admin são tolerados; erros não.

## Regras
- `ValidationPipe` com whitelist + `forbidNonWhitelisted` é intencional. Não ampliar DTOs para aceitar campos que o servidor devolve.
- Corpo de escrita é montado campo a campo no cliente (nunca reenviar o objeto lido).
- O tenant vem sempre do JWT, nunca do corpo ou da URL.
- Push na `main` = deploy de produção. O trabalho entra pela `qa`.
- Textos novos de interface e mensagens em pt-BR.
- Ciclo: Implementar → Testar → Inspecionar o diff → Corrigir → Testar → Validar o comportamento observado pelo usuário.
