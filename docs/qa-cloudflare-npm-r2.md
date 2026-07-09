# QA no servidor: Cloudflare, NPM e R2

Guia para expor o ambiente QA na **mesma VPS e mesma conta Cloudflare** que produção, sem misturar dados.

Assume:
- Clone QA em `~/projetos/churchmanager-qa` (branch `qa`)
- Nginx Proxy Manager (NPM) já a correr na VPS, na rede Docker `proxy-network`
- Produção já usa domínios como `api.seudominio.com` e `admin.seudominio.com`

Substitui `seudominio.com` pelo teu domínio real.

---

## Mapa dos ambientes

| | Produção | QA |
|--|----------|-----|
| Pasta VPS | `~/projetos/churchmanager` | `~/projetos/churchmanager-qa` |
| Compose | `docker-compose.prod.yml` | `docker-compose.qa.yml` |
| API (público) | `api.seudominio.com` | `api-qa.seudominio.com` |
| Admin (público) | `admin.seudominio.com` | `admin-qa.seudominio.com` |
| pgAdmin (opcional) | `pgadmin.seudominio.com` | `pgadmin-qa.seudominio.com` |
| Contentor API (NPM) | `churchmanager-api` ou nome do serviço `api` | `churchmanager-qa-api` |
| Contentor admin | — (se não estiver em prod) | `churchmanager-qa-admin` |
| R2 bucket | `churchmanager-uploads` | `churchmanager-uploads-qa` |

---

## 1. Cloudflare DNS

No painel Cloudflare → **DNS** → **Records**, adiciona (mesmo IP da VPS que prod):

| Tipo | Nome | Conteúdo | Proxy |
|------|------|---------|-------|
| A | `api-qa` | IP da VPS | Proxied (nuvem laranja) |
| A | `admin-qa` | IP da VPS | Proxied |
| A | `pgadmin-qa` | IP da VPS | Proxied (opcional) |

Não é preciso criar zona nova — são subdomínios na zona existente.

### SSL/TLS (Cloudflare)

Em **SSL/TLS** → **Overview**:
- Modo recomendado com NPM: **Full (strict)** (certificado válido no origin)
- Se usares **Origin Certificate** do Cloudflare no NPM (passo 2), **Full (strict)** funciona bem

Em **SSL/TLS** → **Edge Certificates**:
- **Always Use HTTPS**: On (opcional mas recomendado)

---

## 2. Nginx Proxy Manager (NPM)

O NPM e os contentores QA partilham a rede `proxy-network`. O NPM encaminha pelo **nome do contentor** Docker, não por `localhost`.

Confirma na VPS que os contentores QA estão na rede:

```bash
sudo docker network inspect proxy-network | grep churchmanager-qa
```

### Certificado SSL no NPM

Com Cloudflare em modo Proxied, o Let's Encrypt por HTTP às vezes falha. Duas opções:

**Opção A — Origin Certificate (recomendada, mesma conta Cloudflare)**

1. Cloudflare → **SSL/TLS** → **Origin Server** → **Create Certificate**
2. Hostnames: `api-qa.seudominio.com`, `admin-qa.seudominio.com`, `pgadmin-qa.seudominio.com`
3. Validade: 15 anos → gerar
4. NPM → **SSL Certificates** → **Add SSL Certificate** → **Custom**
5. Colar **Certificate** e **Private Key** → Save

**Opção B — Let's Encrypt com DNS Challenge**

1. NPM → certificado Let's Encrypt com challenge DNS
2. API Token Cloudflare com permissão `Zone:DNS:Edit` na zona

### Proxy Host — API QA

NPM → **Hosts** → **Proxy Hosts** → **Add Proxy Host**

| Campo | Valor |
|-------|-------|
| Domain Names | `api-qa.seudominio.com` |
| Scheme | `http` |
| Forward Hostname / IP | `churchmanager-qa-api` |
| Forward Port | `3000` |
| Block Common Exploits | On |
| Websockets Support | On |

Aba **SSL**: certificado (Origin ou Let's Encrypt) → **Force SSL**

### Proxy Host — Admin QA

| Campo | Valor |
|-------|-------|
| Domain Names | `admin-qa.seudominio.com` |
| Forward Hostname | `churchmanager-qa-admin` |
| Forward Port | `80` |

SSL: mesmo certificado ou um que inclua este hostname.

### Proxy Host — pgAdmin QA (opcional)

| Campo | Valor |
|-------|-------|
| Domain Names | `pgadmin-qa.seudominio.com` |
| Forward Hostname | `churchmanager-qa-pgadmin` |
| Forward Port | `80` |

No pgAdmin → **Register Server**: Host `churchmanager-qa-db`, Port `5432`, user/pass do `.env` QA.

### Produção (referência)

Se ainda não tiveres os hosts de prod no NPM, o padrão é o mesmo:

| Domínio | Forward Hostname | Porta |
|---------|------------------|-------|
| `api.seudominio.com` | contentor da API prod (`api` ou nome em `docker ps`) | `3000` |
| `pgadmin.seudominio.com` | `churchmanager_pgadmin` | `80` |

---

## 3. Cloudflare R2 (bucket QA)

QA deve usar **bucket separado** de produção para não misturar uploads.

### Criar bucket

1. Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**
2. Nome: `churchmanager-uploads-qa`
3. Localização: mesma região que prod (opcional)

### Credenciais S3 (API)

1. **R2** → **Manage R2 API Tokens** → **Create API Token**
2. Permissões: **Object Read & Write** no bucket `churchmanager-uploads-qa` (ou Admin R2 se preferires um token para vários buckets)
3. Guardar:
   - Access Key ID
   - Secret Access Key
   - Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (aparece na página R2)

Podes usar o **mesmo token** de prod com acesso a ambos os buckets, ou tokens separados por ambiente.

### URL público dos ficheiros

A API monta URLs com `R2_PUBLIC_URL` + caminho do objeto (`storage.service.ts`).

1. No bucket `churchmanager-uploads-qa` → **Settings** → **Public access**
2. **Allow Access** → **R2.dev subdomain** (ex.: `https://pub-xxxxxxxx.r2.dev`)
3. Esse URL vai para `R2_PUBLIC_URL` no `.env` QA

Alternativa avançada: domínio custom em **Public bucket** (ex. `cdn-qa.seudominio.com`) — requer registo DNS na Cloudflare.

---

## 4. Ficheiro `.env` do clone QA

Em `~/projetos/churchmanager-qa/.env` (a partir de `.env.qa.example`):

```env
# Domínios (alinhados com NPM + Cloudflare)
API_URL=https://api-qa.seudominio.com/api
ADMIN_CORS_ORIGIN=https://admin-qa.seudominio.com

# R2 — bucket QA
R2_ACCESS_KEY_ID=<access_key>
R2_SECRET_ACCESS_KEY=<secret_key>
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET_NAME=churchmanager-uploads-qa
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev

# Asaas — sandbox em QA
ASAAS_API_URL=https://api-sandbox.asaas.com/v3
```

Depois de alterar `API_URL`, é preciso **rebuild do admin** (o URL da API fica embutido no build):

```bash
cd ~/projetos/churchmanager-qa
sudo docker compose -f docker-compose.qa.yml up -d --build qa-admin
```

---

## 5. Subir stack e validar

```bash
cd ~/projetos/churchmanager-qa
sudo docker compose -f docker-compose.qa.yml up -d --build
```

Checklist:

| Teste | URL / comando | Esperado |
|-------|----------------|----------|
| Health API | `curl -s https://api-qa.seudominio.com/api/health` | `{"status":"ok"}` ou similar |
| Admin | Abrir `https://admin-qa.seudominio.com` | Login do painel |
| CORS | Login no admin sem erro de rede no browser | Pedidos a `api-qa...` OK |
| R2 | Upload de imagem no admin (logo/evento) | URL começa com `R2_PUBLIC_URL` |
| NPM | Logs do proxy host | Sem 502 (contentor down ou rede errada) |

### Erros comuns

| Sintoma | Causa | Solução |
|---------|-------|---------|
| 502 Bad Gateway | NPM não alcança contentor | Verificar `proxy-network` e nomes `churchmanager-qa-*` |
| Certificado inválido | SSL Cloudflare vs NPM | Origin Certificate ou Full (strict) |
| Admin não liga à API | `API_URL` errado no build | Rebuild `qa-admin` com `API_URL` correto |
| CORS bloqueado | `ADMIN_CORS_ORIGIN` sem `https://` ou domínio errado | Igual ao URL do admin, sem barra final |
| Upload falha | `R2_*` ou bucket público | Rever token, bucket e `R2_PUBLIC_URL` |
| Imagens 404 | `R2_PUBLIC_URL` de outro bucket | Usar URL pública do bucket QA |

---

## 6. Webhooks Asaas em QA

O Asaas sandbox precisa de URL HTTPS público. Opções:

1. **Domínio estável:** `https://api-qa.seudominio.com/api/webhooks/asaas/<slug>` (recomendado)
2. **ngrok:** perfil `tunnel` no compose QA — ver [webhooks-local-dev-ngrok.md](./webhooks-local-dev-ngrok.md)

No painel Asaas **sandbox**, configurar webhook com o URL QA e o token do tenant.
