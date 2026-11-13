# Para a sessão que trabalha no PC do Holyrics

Escrito em 12/11/2026 pela sessão que cuida do repositório e da VPS. É o retrato do que
mudou desde o último zip que você enviou (o das 21:50 de 12/11) e do que precisa ser
feito aí. Onde este documento e o código divergirem, vale o código.

## O que mudou de lugar

- O projeto agora vive no repositório **`PauloRhyanK/ChurchManager`**, pasta
  **`apps/ponte/`** (`web/`, `pc/`, `docs/`). O repositório é **público**.
- O trabalho entra pela branch `qa`; `main` é produção. A VPS acompanha a `main`.
- **A sua pasta solta deixou de ser a fonte.** Tudo abaixo foi feito em cima do seu
  último zip. Um zip novo feito da pasta solta apagaria o painel novo, a atualização, o
  cofre e o estúdio. A primeira tarefa aí é passar a trabalhar a partir do repositório
  (ver "O que fazer aí", passo 1).

## O que foi feito, por assunto

### 1. Versão web no ar

- `https://ponte.igrejaparaiso.com.br`, com HTTPS, na VPS da igreja.
- Roda em **Docker**, não em systemd: o proxy da VPS é o Nginx Proxy Manager em
  contêiner e não alcança o `127.0.0.1` do host. Saiu o `web/ponte-web.service`; entraram
  `Dockerfile`, `.dockerignore` e `docker-compose.yml` em `apps/ponte/`. Um processo só
  (`--workers 1`), usuário sem privilégio, sem porta publicada.
- Segredos em `/etc/ponte-web.env` na VPS. A senha da equipe já foi definida pelo Paulo.
- **A igreja ainda não está ligada à web**: `/saude` responde `"igreja": false`.
- Detalhes: [`IMPLANTAR-NA-VPS.md`](IMPLANTAR-NA-VPS.md).

### 2. Correção de segurança no login da web

O limite de tentativas de senha lia o **primeiro** valor do `X-Forwarded-For`, que é o
que o visitante quiser escrever. Agora lê o último, que é o que o proxy acrescenta
(`_ip()` em `web/app.py`). Testado: cinco erros do mesmo endereço bloqueiam, mesmo
forjando o começo do cabeçalho.

### 3. Cofre: a configuração da igreja guardada na web

Pedido do Paulo: um PC novo tem de sair configurado, mesmo com o principal morto.

- **`pc/ponte/cofre.py`** (novo). A máquina principal, com `web.ativo: true`, entrega à
  web a cada mudança: `config.yaml`, `chegada.yaml`, `looks_salvas.yaml`, `patch.yaml` e
  tudo que estiver em `pc/obs/`, e os `_*.json` da raiz (credenciais do YouTube, ordem
  do culto, marcas do louvor, progresso do guia). Ficam de fora só `_atualizou.json` e
  `_obs_stream_anterior.json`. `cofre: false` no bloco `web` desliga.
- **Web**: `POST /api/cofre` (chave da igreja), guardado num volume Docker
  (`/dados/cofre.json`, modo 600). `GET /api/cofre` só diz o que há, nunca o conteúdo.
- **`pc/obs/`** é preenchida à mão: `obs/scenes/<coleção>.json` e
  `obs/profiles/<perfil>/`, copiados de `%APPDATA%\obs-studio\basic\` do notebook da
  transmissão. O perfil tem a chave do YouTube; a pasta está no `.gitignore`.

### 4. Instalador de um arquivo só

- Na web, `/instalar` (logado) entrega `instalar-ponte.bat` com um **código temporário**
  (30 minutos, 5 usos). O `.bat` baixa e executa `/instalar.ps1`, que é o
  **`pc/instalar-do-zero.ps1`** (novo).
- O roteiro pergunta o papel, baixa o projeto e a configuração do papel
  (`/api/instalar/pacote?papel=`), instala Python e OBS por `winget` se faltarem, põe as
  cenas e o perfil do OBS no lugar se ainda não existirem, e chama o
  `configurar-este-pc.ps1`.
- Cada papel recebe só o que precisa: `config.yaml` só vai para `holyrics`; `obs/` vai
  para `holyrics` e `transmissao`.
- **`configurar-este-pc.ps1` ganhou o parâmetro `-Papel`** (pula a pergunta quando vem
  do instalador). Foi a única mudança nele.
- Arquivos do cofre que também existem no projeto (`chegada.yaml`, `looks_salvas.yaml`,
  `patch.yaml`) viajam em `_do_cofre/` dentro do zip; o roteiro os põe por cima.

### 5. Atualização dos PCs

- **`pc/ponte/versao.py`** (novo): a versão é uma impressão digital (12 caracteres) dos
  arquivos **do projeto**. Ficam de fora os da igreja (`config.yaml`, `maquina.yaml`,
  `chegada.yaml`, `looks_salvas.yaml`, `patch.yaml`), `_*.json`, `obs/`, logs e áudio. A
  web calcula com o mesmo arquivo, então os dois lados fazem a mesma conta.
- **`pc/ponte/atualizar.py`** (novo): baixa `/api/atualizacao/pacote`, guarda a versão
  atual em `_versao_anterior/`, troca só os arquivos do projeto, roda `pip` se o
  `requirements.txt` mudou, e desfaz tudo se algo falhar.
- **`pc/iniciar.py`** (novo): o lançador. Atualiza ao ligar (menos no papel `som`, e
  nunca se `_ordem_atual.json` indica culto em andamento nas últimas 6 horas), sobe o
  `app.py`, religa quando ele sai com código 42, e volta para a versão anterior se a
  nova morrer em menos de 45 segundos.
- **`iniciar-ponte.ps1` mudou uma linha**: `& $python iniciar.py` no lugar de
  `& $python app.py`.
- No `app.py`: uma thread pergunta a versão à web de 10 em 10 minutos;
  `GET /api/atualizacao`; `POST /api/painel/atualizar` (aplica e sai com 42; só funciona
  se a ponte foi aberta pelo lançador).
- `maquina.yaml` aceita `atualizar: nunca`. **Ponha isso no PC onde você desenvolve.**
- A comparação é "versão diferente", não "mais nova": num PC com código à frente da
  web, o botão Atualizar traz a versão da web por cima.
- O `/baixar` local monta o pacote de uma lista fixa (`PACOTE` no `app.py`). Arquivo
  novo do projeto precisa entrar nessa lista, senão o PC instalado pela rede fica sem
  ele. Já entraram `iniciar.py`, `instalar-do-zero.ps1` e `estudio.html`.

### 6. Painel do culto novo (`painel.html` foi reescrito)

- **Uma tela para três lugares**: PC, celular e `ponte.igrejaparaiso.com.br/painel`. O
  arquivo é o mesmo; a web o serve da pasta `pc/`.
- **Duas rotas**: `GET /api/painel` (o retrato inteiro) e `POST /api/painel/acao`
  (uma ação). O painel não usa mais `/api/status`, `/api/estado`, `/api/cues`,
  `/api/cue/<id>` nem `/api/ordem/ir/<id>`; essas rotas continuam existindo.
- **Lista fechada de ações** (`_acao_do_painel` no `app.py`): `ir`, `gravar`,
  `transmitir`, `tela_preta`, `recado`, `cena_luz`, `apagar_luz`, `modo_luz`, `cortar`,
  `visibilidade`, `ordem`. Não há "rode esta cue".
  - `gravar`, `transmitir` e `tela_preta` usam os pares de cues de sempre
    (`gravar`/`parar_gravacao`, `transmitir`/`parar_transmissao`,
    `tela_preta`/`tela_volta`). Sem as duas cues no config, o controle não aparece.
  - `recado` roda cues cujo id começa com `recado_`.
  - `cortar` manda `TriggerStudioModeTransition` ao OBS: é o botão "Pôr no ar", que
    aparece quando a cena preparada difere da que está no ar. **Novo e nunca testado
    num OBS.**
  - `modo_luz` recusa os modos marcados como perigosos.
  - `visibilidade` muda a transmissão ativa (ou a agendada) do primeiro canal autorizado.
- **Tudo fica anotado** num histórico em memória, com a origem (`local` ou `web`).
- **Textos sem jargão**: o painel mostra as cenas do OBS sem o número ("2. Louvor" vira
  "Louvor") e descreve cada momento a partir dos passos dele. Dá para ajustar com
  `obs.apelidos`, `luzes.nomes` e `descricao:` na cue (ver o fim do `config.exemplo.yaml`).
- `_ler_estado_obs` passou a guardar também `tempo_ms` (duração da transmissão).
- Uma thread consulta o YouTube de 2 em 2 minutos (título, link, visibilidade) para o
  cartão de transmissão.

### 7. Controle pela web

- O espelho agora leva também o retrato do painel (`Espelho(..., extra=...)` em
  `ponte/espelho.py`), e `_pedido_da_web` aceita o tipo `painel`.
- A web tem a sua própria lista do que pode pedir (`ACOES_DO_PAINEL` em `web/app.py`);
  `ordem` fica de fora.
- **Chave "Aceita comandos / Só mostra"** no menu Mais do painel local
  (`POST /api/painel/remoto`, guardada em `_remoto.json`). Nasce em "aceita".
- As máquinas secundárias se apresentam à principal em cada pedido (cabeçalhos
  `X-Ponte-Maquina`, `X-Ponte-Papel`, `X-Ponte-Versao`); o menu Mais lista os PCs e quem
  precisa atualizar.

### 8. Tela de montar cena (`cenas.html` foi reescrita)

Só a casca mudou. O que ela envia para `/api/luz/canais` e `/api/luz/look` foi comparado
com o da versão antiga em 200 mil estados sorteados, sem diferença. Saiu a seção
"Movimento" (agora no painel e no estúdio); `confirm()` virou diálogo próprio.

### 9. Estúdio de luz (`/estudio`, novo)

- `estudio.html`, rotas `GET /estudio`, `GET` e `POST /api/luz/estudio`, uma camada nova
  no fim de `ponte/movimento.py`, três trechos em `ponte/seguidor.py`, e a chave
  opcional `paleta` nos grupos `cortina` e `teto` do `config.exemplo.yaml`.
- Seleção por luz, cor, segunda cor alternada, força, direção por arraste, e sete
  animações (respirar, onda, batida, vai e vem, círculo, varrer, trocar cores) com
  velocidade, tamanho e atraso, só nas luzes escolhidas.
- **Limites no servidor**: período mínimo, raio máximo e velocidade máxima iguais ou
  mais conservadores que os dos modos atuais; direção cercada em 64–192.
- **Os oito modos antigos saem idênticos**, quadro a quadro (7.200 quadros comparados).
- **Seguidor antigo**: a animação viaja numa chave nova (`estudio`) e, enquanto ela
  vale, `modo` diz `parado`. Um PC do som com código antigo fica parado na cena. As
  animações do estúdio só aparecem na igreja depois que o PC do som for atualizado.
- **Criar cores**: "Adicionar uma cor" abre quatro réguas (matiz, branco, temperatura,
  brilho). A cor vira os mesmos números das de fábrica e fica guardada no navegador.
- "Mostrar na igreja enquanto mexo" nasce desligado.
- Testes: `python _testar_estudio.py` (93 checagens, sem equipamento).

## O que NÃO foi testado

Tudo foi verificado num Mac, com OBS, Holyrics e YouTube desligados e a luz no driver
`agente`. Nunca rodou em Windows nem com equipamento:

- `instalar-do-zero.ps1` e o `instalar-ponte.bat` gerado pela web;
- `iniciar-ponte.ps1` chamando `iniciar.py` (o código 42, o `os._exit`, a volta atrás);
- `pip` rodando dentro da atualização num `.venv` do Windows;
- o botão "Pôr no ar" (`TriggerStudioModeTransition`);
- a visibilidade do YouTube pelo painel;
- o painel com OBS e Holyrics respondendo de verdade;
- qualquer coisa do estúdio num refletor.

Dois testes antigos do motor (`_testar_movimento.py` e `_testar_agente.py`) falham na
checagem "o pan fica dentro do limite" (esperam 96–160; o modo "lento" do
`config.exemplo.yaml` tem raio 48). O primeiro já falhava antes destas mudanças.

## O que fazer aí

1. **Passar a trabalhar a partir do repositório.**
   - Clone `https://github.com/PauloRhyanK/ChurchManager.git` e trabalhe em
     `apps/ponte/`.
   - **Antes de trocar a pasta em uso, compare-a com `apps/ponte/pc` do repositório.**
     Se houver mudança sua posterior ao zip das 21:50 de 12/11, ela precisa ser trazida
     para cima do código novo, não o contrário. Liste as diferenças para o Paulo.
   - Os arquivos da igreja (`config.yaml`, `maquina.yaml`, `chegada.yaml`,
     `looks_salvas.yaml`, `patch.yaml`, `_*.json`) ficam os daí.
   - Ponha `atualizar: nunca` no `maquina.yaml` desse PC.
   - Para devolver trabalho: branch a partir da `qa` e push, se o Paulo configurar o
     acesso; senão, mande um patch (`git diff` ou `git format-patch`) dizendo sobre
     qual commit foi feito. **Zip da pasta inteira, não.**
2. **Testar no Windows**, num dia sem culto, nesta ordem: `iniciar-ponte.bat` subindo
   pelo `iniciar.py`; o painel novo com OBS e Holyrics ligados; o botão Atualizar; o
   instalador de um arquivo num PC de teste.
3. **Ligar a igreja à web**: no `config.yaml` do principal, bloco `web:` com
   `ativo: true`, a `url` e a `chave` (o Paulo copia da VPS: nunca por chat nem por
   arquivo versionado); no `chegada.yaml`, `endereco_no_ar: true`. Conferir que
   `/saude` passa a `"igreja": true` e que o painel abre em
   `https://ponte.igrejaparaiso.com.br/painel`.
4. **Preencher `pc/obs/`** com a exportação do OBS do notebook, para o cofre.
5. **Planejar a troca no PC do som.** Ele roda a versão antiga em `C:\ponte-culto` e
   leva a luz. O instalador e a atualização automática se recusam a mexer nele; a troca
   é manual, com calma.
6. **Com refletor ligado e alguém olhando o palco**: conferir os limites do estúdio,
   para que lado é esquerda e direita, e se "Abrir" e "Cruzar" estão com o nome certo.

## Regras que continuam valendo

- Segredo nunca vai para o Git, para log nem para o chat. O repositório é público.
- A igreja liga para a web, nunca o contrário. Nenhuma porta aberta no roteador.
- Arquivos `.ps1`: só ASCII dentro de texto.
- Um processo só na web (`--workers 1`).
- Textos de tela em pt-BR, sem jargão ("cue", "look", "preset", "DMX" não aparecem).
