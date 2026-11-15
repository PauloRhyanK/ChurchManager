# Prompt para a sessão que tem acesso à VPS

Cole o texto abaixo na sessão do Claude que alcança a VPS.

> **Histórico.** A implantação de 12/11/2026 acabou em Docker, não em systemd: o proxy
> da VPS é o Nginx Proxy Manager em contêiner e não alcança `127.0.0.1` do host. Onde
> este prompt e o [`IMPLANTAR-NA-VPS.md`](IMPLANTAR-NA-VPS.md) divergirem, vale o segundo.

---

Quero pôr no ar a versão web da **Ponte do Culto**, o sistema da equipe de multimídia
da Igreja Paraíso, em **https://ponte.igrejaparaiso.com.br**, nesta VPS.

O código está no repositório do ChurchManager
(`https://github.com/PauloRhyanK/ChurchManager`), na pasta `apps/ponte/`. Traga a
pasta **inteira**: a aplicação fica em `apps/ponte/web/`, mas ela serve arquivos da
pasta `apps/ponte/pc/` ao lado. Leia primeiro `apps/ponte/README.md` e
`apps/ponte/docs/IMPLANTAR-NA-VPS.md` — o segundo é o passo a passo, e eu quero que
você siga ele.

**O que a aplicação é, em uma frase:** um Flask pequeno, sem banco de dados, que
guarda na memória o estado do culto que a igreja entrega a cada 2 segundos e mostra
isso atrás de uma senha. Ela nunca abre conexão para a igreja; é a igreja que liga
para ela.

**Antes de mudar qualquer coisa, me mostre o que já existe nesta VPS.** Aqui já roda
pelo menos o `admin.igrejaparaiso.com.br`, e ele não pode cair. Quero saber:

1. Qual proxy está na frente (nginx, Caddy, Traefik, outro) e como os sites estão
   configurados nele.
2. Como o HTTPS é emitido hoje (certbot, Caddy automático, outro).
3. Se a porta `8710` em `127.0.0.1` está livre.
4. Qual Python 3 existe.

Depois disso, me diga o plano em poucas linhas e só então execute. Configure o site
novo **do mesmo jeito que os que já existem**, sem trocar de proxy nem reorganizar o
que está lá.

**Regras que não se quebram:**

- **Um processo só:** `gunicorn --workers 1 --threads 8`, ouvindo em `127.0.0.1:8710`.
  O estado mora na memória; com dois processos a tela mostra dado velho.
- **Segredos nunca aparecem no chat, em log, nem em arquivo versionado.** São três
  variáveis, num arquivo fora do repositório (por exemplo `/etc/ponte-web.env`,
  `chmod 600`, dono root):
  - `PONTE_CHAVE` e `PONTE_SEGREDO`: gere você, na VPS, direto para dentro do arquivo
    (`openssl rand -hex 32`), **sem imprimir o valor**.
  - `PONTE_SENHA`: é a senha que a equipe vai digitar. **Eu escolho e eu digito.** Deixe
    a linha pronta e me diga o comando para eu mesmo editar o arquivo.
- Não defina `PONTE_HTTP` (é só para teste local sem HTTPS).
- O proxy precisa repassar `X-Forwarded-For` e não pode fazer cache.
- Não abra nenhuma porta nova para a internet além das que o proxy já usa.
- Não crie túnel, VPN nem nada que alcance a rede da igreja. Não é necessário.
- Rode como um usuário de sistema sem login (por exemplo `ponte`), não como root.

**DNS:** o registro `A` de `ponte.igrejaparaiso.com.br` precisa apontar para o IP desta
VPS. Se você não tiver acesso ao DNS, me diga exatamente qual registro criar e espere
eu confirmar que criei antes de pedir o certificado.

**Como eu vou saber que deu certo** — rode e me mostre o resultado destes três:

```bash
curl -s https://ponte.igrejaparaiso.com.br/saude
# esperado: {"igreja":false,"ok":true}

curl -s -o /dev/null -w "%{http_code}\n" https://ponte.igrejaparaiso.com.br/api/aqui
# esperado: 401

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ponte.igrejaparaiso.com.br/api/espelho \
     -H "Content-Type: application/json" -H "X-Ponte-Chave: errada" -d '{}'
# esperado: 403
```

`"igreja": false` é o certo nesta etapa: a igreja só se conecta depois, quando eu
puser a chave no PC de lá. E confira que `admin.igrejaparaiso.com.br` continua
respondendo como antes.

**No fim, me entregue:**

1. O que você instalou e onde (pasta, serviço, arquivo do proxy).
2. O comando para eu ver a `PONTE_CHAVE` **eu mesmo**, no terminal da VPS — vou
   copiar dali para o PC da igreja. Não me mostre o valor.
3. O comando para atualizar depois (`git pull` + reiniciar o serviço).
4. Qualquer coisa que ficou diferente do `apps/ponte/docs/IMPLANTAR-NA-VPS.md`, e por quê.

Se alguma coisa do documento não bater com o que você encontrar na VPS, pare e me
pergunte em vez de improvisar.
