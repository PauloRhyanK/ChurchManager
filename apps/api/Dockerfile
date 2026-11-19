# Imagem da API em etapas: `prod-deps` instala só as dependências de produção, `builder`
# instala tudo e compila; a imagem final só recebe o que roda em produção.
#
# Na imagem final:
#   dist/                código compilado da API (node dist/main.js)
#   dist/tools/          scripts de manutenção e seed compilados (node dist/tools/scripts/<nome>.js)
#   node_modules/        só dependências de produção, com o cliente gerado e as engines do Prisma
#   prisma/              schema e migrações (o entrypoint roda `prisma migrate deploy`)
# O `prisma` (CLI) é dependência de produção porque o entrypoint aplica as migrações na subida.

FROM node:22-bookworm-slim AS base

WORKDIR /app

# openssl: o Prisma escolhe a engine pela versão do OpenSSL do sistema (igual no build e na execução).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Dependências de produção + cliente e engines do Prisma. Só depende do lockfile e do schema,
# então, com o cache do build no CI, esta camada sai idêntica quando só o código muda e a VPS
# não precisa baixá-la de novo.
FROM base AS prod-deps

COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --omit=dev \
  && npx prisma generate \
  && npm cache clean --force

# Compilação: precisa das dependências de desenvolvimento (Nest CLI, TypeScript).
FROM base AS builder

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json tsconfig.scripts.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts

RUN npx prisma generate \
  && npm run build \
  && npm run build:scripts

FROM base AS production

ENV NODE_ENV=production

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node --chmod=755 docker-entrypoint.sh ./

USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
