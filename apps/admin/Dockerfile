FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG API_URL
ENV API_URL=${API_URL}

# Limita o heap do Node durante o build (Vite/Rollup). Sem isto, o build pode
# consumir toda a RAM da VPS e disparar o OOM killer, congelando o servidor.
# Se o build falhar por falta de memória, aumente este valor (ex.: 1536).
ARG NODE_BUILD_MEMORY=1024
ENV NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_MEMORY}

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
