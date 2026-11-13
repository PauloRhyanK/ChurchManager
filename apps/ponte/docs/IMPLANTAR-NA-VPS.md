# Implantar a versão web na VPS

Objetivo: `https://ponte.igrejaparaiso.com.br` servindo a pasta `apps/ponte/web/` do
repositório do ChurchManager, com HTTPS e senha, pronta para a igreja se conectar.

## O que a aplicação é

Um Flask pequeno (`apps/ponte/web/app.py`), sem banco de dados. Guarda na memória o último
retrato do culto que a igreja entregou, e uma fila curta de pedidos para ela buscar.
Ela **nunca** abre conexão para a igreja.

Restrições que vêm disso:

- **Um processo só**: `gunicorn --workers 1 --threads 8`. O estado mora na memória.
- **Reiniciar é barato**: a igreja reentrega o retrato em 2 segundos.
- A pasta `pc/` precisa estar ao lado de `web/` (a aplicação serve arquivos de lá e
  monta o `.zip` de `/baixar` a partir dela). Traga a pasta `apps/ponte/` inteira.

## Variáveis de ambiente (obrigatórias)

| Variável | Para quê | Regra |
|---|---|---|
| `PONTE_SENHA` | A senha que a equipe digita para entrar | 8+ caracteres. **O Paulo escolhe e digita.** |
| `PONTE_CHAVE` | O segredo que a ponte da igreja apresenta | 24+ caracteres, aleatória. Gerar na VPS. |
| `PONTE_SEGREDO` | Assina o cookie de sessão | 64 hex aleatórios. Gerar na VPS. |

Sem `PONTE_SENHA` e `PONTE_CHAVE` a aplicação se recusa a subir — de propósito.
Não defina `PONTE_HTTP`: ela existe só para teste local sem HTTPS.

Guarde as três num arquivo fora do repositório, por exemplo `/etc/ponte-web.env`
com `chmod 600`. **Nenhuma delas vai para o Git, para log ou para o chat.**

## Passos

1. Criar um usuário de sistema `ponte` sem login e clonar o ChurchManager em
   `/opt/ponte-do-culto`, trazendo só a pasta da Ponte:

   ```bash
   git clone --filter=blob:none --sparse https://github.com/PauloRhyanK/ChurchManager.git /opt/ponte-do-culto
   git -C /opt/ponte-do-culto sparse-checkout set apps/ponte
   ```

   É um clone **separado** do que já existe na VPS para a API: aquele fica na pasta
   do root, que o usuário `ponte` não lê (e o serviço roda com `ProtectHome=true`).
2. Em `/opt/ponte-do-culto/apps/ponte`:
   `python3 -m venv web/.venv && web/.venv/bin/pip install -r web/requirements.txt`
3. Criar `/etc/ponte-web.env` com as três variáveis.
4. Instalar `apps/ponte/web/ponte-web.service` em `/etc/systemd/system/`, ajustar caminhos,
   `systemctl enable --now ponte-web`.
5. Proxy reverso com HTTPS para `127.0.0.1:8710` (Caddy ou nginx + certbot). O proxy
   precisa repassar `X-Forwarded-For` — o limite de tentativas de senha usa esse
   cabeçalho — e **não** pode ter cache.
6. DNS: registro `A` de `ponte.igrejaparaiso.com.br` para o IP da VPS.

## Como conferir

```bash
curl -s https://ponte.igrejaparaiso.com.br/saude
# {"igreja":false,"ok":true}     <- no ar, igreja ainda não conectada: é o esperado

curl -s -o /dev/null -w "%{http_code}\n" https://ponte.igrejaparaiso.com.br/api/aqui
# 401                            <- sem senha, recusa

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ponte.igrejaparaiso.com.br/api/espelho \
     -H "Content-Type: application/json" -H "X-Ponte-Chave: errada" -d '{}'
# 403                            <- chave errada, recusa
```

Abrir no navegador: tem que cair na tela de senha, e depois de entrar mostrar
"A igreja ainda não se conectou a esta versão web".

## Ligar a igreja (feito no PC do Holyrics, não na VPS)

No `config.yaml` do PC principal, bloco `web:` — `ativo: true`, a `url`, e a `chave`
igual à `PONTE_CHAVE` da VPS. Em `chegada.yaml`, `endereco_no_ar: true`. Reiniciar a
ponte. Em segundos `/saude` passa a responder `"igreja": true`.

A chave tem que ir da VPS para o PC da igreja **por um caminho que não seja este
chat nem o repositório** — o Paulo copia de um lugar e cola no outro.

## O que não fazer

- Não abrir porta no roteador da igreja nem criar túnel para dentro dela.
- Não subir mais de um worker.
- Não pôr segredo em arquivo versionado, em variável de build ou em log.
- Não expor o gunicorn direto na internet: só atrás do proxy com HTTPS.
