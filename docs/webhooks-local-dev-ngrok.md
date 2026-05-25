# Webhooks Asaas em desenvolvimento local (ngrok)

O Asaas envia eventos para um URL **público em HTTPS**. O teu `http://localhost:3000` não é acessível a partir da internet. Com **[ngrok](https://ngrok.com/)** crias um túnel que expõe a API local sob um domínio temporário (ou fixo, em planos pagos).

## 1. Instalar e autenticar o ngrok

1. Cria conta em [ngrok.com](https://ngrok.com/) e obtém o **authtoken**.
2. Instala o CLI e regista o token (uma vez por máquina):

```bash
ngrok config add-authtoken <TEU_AUTHTOKEN>
```

## 2. Arrancar a API local

- **Docker:** `docker compose up` na raiz — API em `http://localhost:3000`.
- **Sem Docker:** `npm run start:dev` em `apps/api` — confirma a porta no `.env` (`PORT`).

## 2.1 Ngrok **dentro** do Docker (recomendado se já usas Compose)

Não precisas de instalar o CLI do ngrok no Windows.

1. Authtoken: [dashboard ngrok](https://dashboard.ngrok.com/get-started/your-authtoken).
2. No `.env` na raiz do repo, adiciona:

   ```env
   NGROK_AUTHTOKEN=cola_o_token_aqui
   ```

3. Na raiz do monorepo:

   ```bash
   # Dev local
   docker compose --profile tunnel up -d

   # Servidor dev (docker-compose.dev.yml)
   docker compose -f docker-compose.dev.yml --profile tunnel up -d
   ```

   O serviço `ngrok` / `churchmanager-ngrok` usa `env_file: .env` e lê `NGROK_AUTHTOKEN` de lá. O tráfego público vai para a API na rede interna (`http://api:3000` ou `http://churchmanager-backend-api:3000`).

4. Descobre o URL HTTPS público:
   - `docker compose logs ngrok` ou `docker compose -f docker-compose.dev.yml logs churchmanager-ngrok` (procura `url=https://…`), ou
   - abre `http://localhost:4040` no browser (inspector do ngrok).

5. Webhook no Asaas: `https://<subdomínio>/api/webhooks/asaas/<slug>` + header `asaas-access-token`.

Sem `--profile tunnel`, o `ngrok` **não** sobe; `docker compose up` continua a funcionar como antes.

## 3. Abrir o túnel com o **CLI** no host (alternativa)

```bash
ngrok http 3000
```

No terminal do ngrok aparece um URL **Forwarding**, por exemplo:

`https://a1b2-3c4d-5e6f.ngrok-free.app` → `http://localhost:3000`

Copia o URL **https** (sem barra final).

## 4. URL do webhook no Asaas

O endpoint da aplicação é:

```text
POST https://<subdominio-ngrok>/api/webhooks/asaas/<slug>
```

Exemplo para o tenant de demo (`slug=demo`):

```text
https://a1b2-3c4d-5e6f.ngrok-free.app/api/webhooks/asaas/demo
```

- **`slug`** — o mesmo `slug` da igreja na tabela `tenants` (ex.: `demo`).
- **Autenticação** — o Asaas deve enviar o header **`asaas-access-token`** com o **mesmo** valor que guardaste como *webhook token* do tenant (painel admin → credenciais Asaas, ou o que configuraste na sandbox).

No painel Asaas (Integrações / Webhooks, conforme a UI actual), regista este URL e o token de autenticação do webhook.

## 5. Planos gratuitos vs URL fixo

No plano **grátis**, o subdomínio do ngrok **muda** quando reinicias o túnel. Sempre que isso acontecer, tens de **actualizar o URL do webhook** no Asaas.

Para URL estável: domínio reservado no ngrok, outro serviço de túnel (ex. Cloudflare Tunnel), ou ambiente de **staging** com HTTPS real.

## 6. Verificar se chega à API

- Com o túnel activo, no Asaas podes usar “reenviar evento” ou gerar um pagamento de teste na sandbox.
- Logs: `docker compose logs -f api` ou consola do `npm run start:dev` — deves ver `POST /api/webhooks/asaas/...`.

### Erros comuns

| Situação | O que verificar |
|----------|-----------------|
| `401` / token inválido | Header `asaas-access-token` igual ao token do tenant (o que cifraste na API). |
| `404` | `slug` no path errado; prefixo `/api` em falta. |
| Página intermédia do ngrok (browser) | Pedidos **servidor-a-servidor** (Asaas → API) não passam pelo aviso do browser; se testares com o browser, pode aparecer “Visit Site”. |
| Timeout | ngrok e API têm de estar ambos a correr; firewall local. |

## 7. Produção

Em produção não uses ngrok: domínio próprio (ex. `https://api.igreja.pt/api/webhooks/asaas/<slug>`) atrás de TLS terminado no proxy ou no load balancer.

Documentação geral do fluxo financeiro: [financial-schema-and-webhooks.md](./financial-schema-and-webhooks.md).
