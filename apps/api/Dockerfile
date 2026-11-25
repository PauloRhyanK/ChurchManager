FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl python3 ffmpeg \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm install prisma@6.19.3 tsx@4.19.3 --no-save

COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
COPY --from=builder /app/dist ./dist

RUN npx prisma generate

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
  && chown -R node:node /app

USER node

EXPOSE 3000

# Commit da imagem, exposto como `releaseId` em GET /api/health (com token).
ARG RELEASE_ID=
ENV RELEASE_ID=$RELEASE_ID

ENTRYPOINT ["./docker-entrypoint.sh"]
