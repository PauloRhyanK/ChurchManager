# Implantar a versão web na VPS

Objetivo: `https://ponte.igrejaparaiso.com.br` servindo a pasta `apps/ponte/web/` do
repositório do ChurchManager, com HTTPS e senha, pronta para a igreja se conectar.

## O que a aplicação é

Um Flask pequeno (`apps/ponte/web/app.py`), sem banco de dados. Guarda na memória o último
retrato do culto que a igreja entregou, e uma fila curta de pedidos para ela buscar.
Ela **nunca** abre conexão para a igreja.

Restrições que vêm disso:

- **Um processo só**: `gunicorn --workers 1 --threads 8` (já está no `Dockerfile`). O
  estado mora na memória.
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

## O cofre

A versão web também guarda a configuração da igreja (o `config.yaml` com os segredos,
as cenas de luz, a exportação do OBS), que o PC principal entrega. Fica no volume
Docker `ponte_ponte-dados`, em `/dados/cofre.json` dentro do contêiner, legível só pelo
usuário `ponte`. É o que o instalador de `/instalar` entrega a um PC novo.

- **Entra na rotina de backup** da VPS: a pasta do volume é
  `/var/lib/docker/volumes/ponte_ponte-dados/_data`.
- **Quem pode tirar segredo daqui:** quem está logado com a senha da equipe gera um
  instalador com um código que vale 30 minutos. A senha da equipe passou a proteger os
  segredos da igreja, não só a tela: precisa ser forte.
- **Para esvaziar:** `docker exec ponte-web rm /dados/cofre.json`. O PC principal
  entrega de novo na próxima mudança, a menos que esteja com `cofre: false` no config.

## Como a VPS está montada (conferido em 12/11/2026)

Todos os sites da VPS são contêineres Docker na rede `proxy-network`, atrás do
Nginx Proxy Manager (contêiner `global-proxy`), que também emite os certificados
(Let's Encrypt). O proxy alcança cada site pelo **nome do contêiner**, não por uma
porta do host. Por isso a Ponte roda do mesmo jeito: contêiner `ponte-web`, sem porta
publicada. Dentro dele o processo é o usuário `ponte`, sem privilégio, com o sistema
de arquivos só de leitura.

A primeira versão deste documento previa systemd ouvindo em `127.0.0.1:8710`. Não
serve aqui: o proxy está dentro do Docker e não enxerga o `127.0.0.1` do host.

## Passos

1. Clonar o ChurchManager em `/opt/ponte-do-culto`, trazendo só a pasta da Ponte:

   ```bash
   git clone --filter=blob:none --sparse https://github.com/PauloRhyanK/ChurchManager.git /opt/ponte-do-culto
   git -C /opt/ponte-do-culto sparse-checkout set apps/ponte
   ```

   É um clone separado do que a API usa (`~/projetos/churchmanager`), para que
   atualizar a Ponte nunca mexa na API, e vice-versa.
2. Criar `/etc/ponte-web.env` (`chmod 600`, dono root) com as três variáveis, uma por
   linha, no formato `NOME=valor`, sem aspas e sem espaços em volta do `=`.
3. Subir: `cd /opt/ponte-do-culto/apps/ponte && docker compose up -d --build`
4. No Nginx Proxy Manager, criar o Proxy Host:
   - Domain: `ponte.igrejaparaiso.com.br` · Scheme: `http` · Forward Hostname:
     `ponte-web` · Port: `8710`
   - **Cache Assets: desligado.** Block Common Exploits: ligado.
   - SSL: pedir certificado novo (Let's Encrypt), Force SSL e HTTP/2 ligados.

   O proxy já repassa `X-Forwarded-For` por padrão — o limite de tentativas de senha
   usa esse cabeçalho.
5. DNS: registro `A` de `ponte.igrejaparaiso.com.br` para o IP da VPS, **sem o proxy
   da Cloudflare** ("DNS only", nuvem cinza): a Cloudflare guardaria em cache o
   `guia.css` e o `guia.js`. O registro precisa existir antes de pedir o certificado.

## Atualizar depois

```bash
cd /opt/ponte-do-culto && git pull --ff-only && cd apps/ponte && docker compose up -d --build
```

Trocar a senha: editar `/etc/ponte-web.env` e rodar
`cd /opt/ponte-do-culto/apps/ponte && docker compose up -d --force-recreate`.

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
- Não expor o gunicorn direto na internet: só atrás do proxy com HTTPS. Não publicar
  porta (`ports:`) no `docker-compose.yml`.
