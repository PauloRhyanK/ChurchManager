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

### 10. Atualização: comparação arquivo por arquivo (correção de 12/11, 23h)

A primeira versão comparava a impressão digital da pasta inteira com a da web. Numa
pasta de verdade há mais que o projeto, então o PC nunca ficava "em dia" e a faixa de
atualização não sumia. Agora `/api/versao` devolve nome e impressão de cada arquivo, e
o PC confere só esses (`versao.diferentes`).

**A versão antiga apagava da pasta o que não reconhecia como do projeto.** Se a
atualização rodou aí mais de uma vez antes desta correção, confira se falta algum
arquivo solto na pasta da ponte. Agora só sai o que uma atualização anterior pôs
(`_projeto.lista`) e o projeto deixou de ter.

### 11. Vigia do retorno na TV (feito a partir da sua especificação)

- **`pc/ponte/vigia_tv.py`** (novo) e `_testar_vigia_tv.py` (34 checagens, sem TV).
  Segue a especificação: sessão pelo `sunshine.log`, 25 s de espera, uma tentativa a
  cada 2 minutos, para em 3 falhas, só confirma pelo `CLIENT CONNECTED` em até 40 s,
  não age com outro aplicativo na tela nem com a TV desligada, e só depois que o
  retorno foi aberto uma vez desde que a ponte subiu.
- A reabertura passa por `Chegada.reabrir_retorno()`, que usa o mesmo `agir()` do
  botão: a guarda contra teclas em dobro é a mesma.
- `_mede_tv` passou a ler o estado do vigia, em vez de bater na TV por conta própria.
- Medida nova `retorno_tv` (verde pelo Sunshine). **O `chegada.yaml` daí é da igreja e
  não é atualizado**: para o passo `p_retorno` ficar verde pela medida, acrescente nele
  `confere: retorno_tv`.
- No painel: linha "TV do altar" no cartão Telão e palco, com "Reabrir o retorno" e
  "Pausar o vigia"; pílula "Retorno na TV" no alto. Rotas `/api/retorno/pausar` e
  `/api/retorno/retomar`. Config opcional `vigia_tv` (ver o fim do `config.exemplo.yaml`).
- **O que eu não pude ver e você precisa conferir:**
  - a saída de `tv-control.ps1 -Action Status`. Eu não tenho esse script. O código
    procura `com.limelight.webos` na saída e, se não achar, o primeiro texto com cara
    de id de aplicativo (três pedaços ou mais separados por ponto, em minúsculas).
    Se a saída tiver outro texto assim (um nome de máquina, por exemplo), o vigia vai
    achar que há "outro aplicativo" e não vai reabrir. Ver `Chegada.tela_da_tv`;
  - o texto exato das linhas do `sunshine.log` (procuro `CLIENT CONNECTED` e
    `CLIENT DISCONNECTED`, como no seu diagnóstico);
  - a confirmação pelas portas UDP 47998-48010 não foi feita: só o registro decide;
  - os cinco passos do teste com a TV, da seção 7 da sua especificação.

### 12. Painel do culto ao vivo (19/11/2026)

Especificação: `docs/superpowers/specs/2026-11-19-ponte-painel-ao-vivo-design.md`, na
raiz do repositório. Feito num Mac, com OBS e Holyrics de mentira.

**O que mudou**

- **A tela de `/` agora é `ao-vivo.html`** (mais `ao-vivo.css` e `ao-vivo.js`): tema
  escuro, ordem do culto com horários e atraso, equipamentos, louvor no centro,
  transmissão à direita. **`painel.html` não foi tocado** e continua em
  `/painel-antigo` (há um atalho no menu Mais da tela nova). Se a tela nova der
  problema num culto, é para lá que se vai.
- **`/api/painel` só cresceu.** Todas as chaves antigas continuam. As novas:
  `versao_do_painel: 2`, `agenda`, `equipamentos`, `internet`, `louvor`, `imagem`,
  `conteudo_versao`, e dentro de `transmissao`: `cenas`, `audios`, `numeros`; dentro de
  `luz`: `climas`, `seguindo`.
- **Quem conduz o louvor agora é a ponte, não a aba do navegador.** `ponte/condutor.py`
  roda no PC principal e é o único que passa letra e troca luz durante uma música. A
  tela só mostra e pede. A `/louvor` continua igual e serve para **marcar os tempos**;
  no culto usa-se uma ou outra, não as duas.
- **Ações novas** (lista fechada, em `ponte/painel_ao_vivo.py`): `cena_transmissao`,
  `clima`, `luz_seguir`, `louvor_assumir`, `louvor_devolver`, `louvor_segurar`,
  `louvor_slide`, `louvor_parte`, `louvor_repetir_refrao`, `louvor_musica`,
  `louvor_comecou`, `louvor_acertar`, `imagem`. **Pela web só `cena_transmissao` e
  `clima`**; passar slide pela web não existe.
- **Clicar numa cena da transmissão põe no ar na hora** (`SetCurrentProgramScene`), sem
  o passo de preparar. O botão "Pôr no ar" continua aparecendo quando o OBS tem uma cena
  preparada diferente.
- **Imagem do OBS no painel**: `GetSourceScreenshot`, 480 px, no máximo uma por segundo
  e só com alguém olhando (`ponte/obs_imagem.py`, rota `GET /api/painel/imagem`).
  **Não vai para a web.** Desliga no menu Mais.
- **Nível de áudio**: uma conexão separada com o OBS, só para o evento
  `InputVolumeMeters` (`ponte/obs_ouvinte.py`). O cliente das cues continua sem eventos.
- **Números**: tempo de gravação e espaço no disco (`GetRecordStatus`, `GetStats`),
  qualidade do envio pelos quadros perdidos dos últimos 30 s (`ponte/saude_envio.py`),
  e, na consulta de 2 minutos ao YouTube, quantos assistem e como o YouTube diz que
  está recebendo.
- **Horários e atraso** (`ponte/agenda.py`): a hora do culto é a do formulário do guia
  de chegada; os minutos de cada momento vêm de fábrica para os ids do
  `config.exemplo.yaml` e podem ser escritos na cue (`minutos:`, `antes: true`). A ponte
  passou a guardar a hora de entrada em cada momento, em `_ordem_atual.json`.
- **Climas de luz**: cinco nomes fixos que apontam para uma cena e um movimento que já
  existem (bloco `climas` do config; há valores de fábrica).
- **O tempo da música** (`ponte/relogio.py`, rota `POST /api/relogio`): hoje a fonte é
  o áudio tocando num navegador (ensaio) ou o botão **"Começou"** (fonte `cronometro`).
  O Reaper vai entrar como mais uma fonte, pela mesma rota.
- **Espelho**: mede quanto cada volta leva (é daí que sai "Internet lenta") e manda a
  letra das músicas do dia só quando ela muda.
- **Sair do momento do louvor encerra a música**: o condutor larga letra e luz.
- **`PONTE_SIMULAR=1`** no ambiente troca OBS e Holyrics por versões de mentira
  (`ponte/simulados.py`) e a tela mostra a faixa "SIMULAÇÃO". Só pelo ambiente, nunca
  pelo config. Para ver o painel sem equipamento:
  `PONTE_SIMULAR=1 PONTE_CONFIG=config.exemplo.yaml PONTE_PORTA=8711 python app.py`.
- Chaves novas e opcionais do `config.yaml`: ver o fim do `config.exemplo.yaml`
  ("PAINEL DO CULTO AO VIVO").
- Arquivos novos em `PACOTE`: `ao-vivo.html`, `ao-vivo.css`, `ao-vivo.js`. Arquivo de
  estado novo: `_louvor_atual.json` (fica fora do Git e do pacote, como os outros
  `_*.json`). Nenhuma dependência nova, nenhum `.ps1` alterado.

**O que não foi construído** (está na especificação, etapa C): a tela da palavra, o
celular do pregador, os versículos e a leitura das músicas pelo módulo Cultos. Na hora
da palavra o centro da tela mostra o momento, o tempo e o que o Holyrics diz que está
no telão.

**Testes novos**, todos sem equipamento: `_testar_agenda.py`, `_testar_saude_envio.py`,
`_testar_audio_obs.py`, `_testar_relogio.py`, `_testar_repertorio.py`,
`_testar_condutor.py`, `_testar_painel_ao_vivo.py` (este sobe o `app.py` e a versão web
dentro do teste).

**O que só dá para conferir aí, e como**

1. **A imagem pesa no notebook?** Num dia sem culto, com a transmissão ligada para um
   destino de teste: 10 minutos com o painel aberto e a imagem ligada, 10 com ela
   desligada (menu Mais). Comparar "Quadros perdidos" nas estatísticas do OBS. Se pesar,
   aumentar `painel.imagem.intervalo` ou desligar.
2. **A imagem chega?** A chamada é a mesma do guia de chegada, em tamanho menor. Conferir
   se aparece e se troca quando a cena troca.
3. **O nível de áudio chega?** As barras aparecem em "Transmissão". Se não aparecerem em
   15 segundos: o evento `InputVolumeMeters` não está chegando pela rede. Anotar a versão
   do obs-websocket. Conferir os **nomes reais das entradas** e escrevê-los em
   `obs.audios`. Conferir se "bom" e "estourando" batem com o que se ouve; os limites
   estão em `palavra()` de `ponte/obs_ouvinte.py`. **Não sei se uma entrada no mudo vem
   com nível zero**; se vier com nível, "fechado" não vai aparecer para ela.
4. **Trocar de cena pelo painel**, com o OBS em modo estúdio e fora dele. A ação usa
   `SetCurrentProgramScene`; em modo estúdio isso troca o programa direto, sem passar
   pela prévia.
5. **Os números**: "Gravação" andando, "Espaço no disco" (é o do disco onde o OBS grava;
   conferir com o Explorer), "Qualidade" numa transmissão de teste (derrubar a internet
   por 20 segundos deve dar "Oscilando" ou "Ruim" e depois voltar a "Boa"), e
   "Assistindo" com alguém assistindo de verdade.
6. **A ordem das cenas** nos botões. O código inverte a lista do `GetSceneList` para
   ficar como no OBS; se sair de trás para a frente, é essa linha em `_ler_estado_obs`.
7. **Os cinco climas no refletor**, com alguém olhando o palco: cada um parece o nome
   que tem? Ajustar no bloco `climas`.
8. **O louvor com o Holyrics de verdade**:
   - `GetSong` devolve o texto dos slides com o token da igreja? (A `/louvor` já usa
     essa ação, então deve.) Sem isso a tela mostra "slide 3 de 34" no lugar da letra.
   - Escolher uma música no painel põe a letra no telão (`ShowLyrics`) no primeiro slide?
   - Na tela manual, Próximo e Anterior chegam ao telão? Quanto demora entre o toque e a
     letra? Esse atraso vai em `relogio.adiantar_ms`.
   - Com `relogio.fonte: cronometro`, marcar uma música na `/louvor`, tocar o mesmo áudio
     no som, apertar "Começou" na primeira batida e ver se a letra acompanha até o fim.
9. **Duas pessoas**: o PC e um celular na rede da igreja, um assume, o outro passa slide.
   A faixa amarela tem que dizer o nome certo nos dois.
10. **A tela** no monitor do PC do telão e num celular.
11. **A atualização em dois tempos**: PC principal novo com a VPS ainda antiga (a web
    tem que continuar mostrando o painel antigo, funcionando), e depois a VPS nova.
12. **Internet**: com a igreja ligada à web, tirar o cabo do roteador: em até 20
    segundos a luz "Internet" fica vermelha e o "Aconteceu agora" anota; o resto do
    painel continua.

### 13. Palavra, celular do pregador e músicas do ChurchManager (19/11/2026, depois da seção 12)

A seção 12 diz que isto "não foi construído". Foi, em seguida, na branch
`claude/ponte-palavra-etapa-c`.

**O que mudou**

- **`ponte/palavra.py`** (novo): os slides do sermão no formato que o módulo Palavras
  propôs (`TITLE`, `VERSE`, `POINT`, `SUMMARY`), quem está passando, e o link do
  pregador. Hoje a palavra vem de `_palavra_do_dia.json` na pasta da ponte (formato no
  fim do `config.exemplo.yaml`); sem o arquivo, não há palavra e nada muda na tela.
- **No painel**, no momento `pregacao` (ou nos de `painel.momento_da_palavra`), o centro
  vira a palavra: slide no telão, o próximo, a lista, Anterior / Tirar do telão /
  Próximo (barra de espaço), e quem está passando. Ações novas, só locais:
  `palavra_slide`, `palavra_assumir`, `palavra_tirar`, `pregador_link`.
- **Versículo vai ao Holyrics só pela referência** (`ShowVerse` com `references`); título
  e ponto vão como texto (`ShowQuickPresentation` com `text`); tirar é
  `CloseCurrentPresentation`. Os nomes são configuráveis no bloco `palavra`.
  **Eu não tenho como confirmar os dois primeiros nomes nem o formato do pedido**: saíram
  do que lembro da documentação do API Server, não de um teste.
- **`verificar_palavra.py`** (novo, no `PACOTE`): diz, para cada ação, "liberada",
  "falta liberar", "não existe" ou "token errado". Sem `--mostrar` manda o pedido vazio,
  para nada aparecer no telão; com `--mostrar` exibe um versículo e um texto de teste.
- **Sem permissão ou com o nome errado**, a lista segue: o painel marca o slide com
  "Abra no Holyrics: João 8:12" e o operador abre à mão.
- **Celular do pregador** (`pregador.html`, novo, no `PACOTE`): o operador toca em
  "Celular do pregador", a ponte sorteia um código e mostra o endereço
  (`http://<ip>:8700/pregador/<código>`). A página só tem Anterior e Próximo. O link
  morre em 6 horas, em "Encerrar o acesso", quando outro é gerado, ou quando a ordem do
  culto é trocada. **Não desenhei o QR code**: a tela mostra o endereço para copiar.
- **Pela internet**: a igreja manda à web só o resumo (SHA-256) do código. A web abre
  `/pregador/<código>` sem a senha da equipe se o resumo confere; o toque entra na fila
  com o tipo `pregador`, e a igreja confere o código de novo antes de passar. Enquanto
  há link valendo, a ponte mantém um segundo pedido de saída pendurado
  (`POST /api/espelho/pedidos`, até 20 s) para o toque chegar na hora. A chave "Só
  mostra" não corta o pregador.
- **Músicas do ChurchManager** (`FonteCultos`, no fim de `ponte/repertorio.py`): liga com
  `repertorio: { fonte: cultos, url, slug, chave }` no config. **A rota de lá ainda não
  existe**; foi escrito contra o formato da especificação do módulo Cultos e testado só
  com ele. Guarda a última resposta em `_culto_do_dia.json` para o caso de a internet
  cair. O id da música no Holyrics é procurado pelo título (`GetSongs`), o que também
  não foi testado.
- A agenda passou a dizer quanto falta do momento atual mesmo sem a hora do culto.

**Testes novos:** `_testar_palavra.py` (ponta a ponta do toque do pregador, pelo Wi-Fi e
pela web, dentro do teste) e mais casos em `_testar_repertorio.py`.

**O que só dá para conferir aí**

1. `python verificar_palavra.py`, fora do culto. Se disser "não existe", abrir a lista
   de ações do API Server do Holyrics, achar a que mostra versículo pela referência e a
   que mostra um texto livre, e escrever os nomes no bloco `palavra` do config. Se disser
   "falta liberar", marcar as permissões no token.
2. `python verificar_palavra.py --mostrar`, com o telão à vista: o versículo aparece com
   a Bíblia e o tema certos? O texto aparece legível? "Tirar" limpa o telão?
3. **Um versículo que o ChurchManager dividiu em dois slides** tem a mesma referência
   nos dois: a ponte pede uma vez e o Holyrics mostra o versículo inteiro. Conferir se é
   isso que o pregador espera, ou se ele precisa do versículo em pedaços (aí a referência
   não basta).
4. **O celular do pregador no Wi-Fi da igreja**: abrir o endereço num celular, passar os
   slides, ver o painel dizer "O pregador está passando". O celular tem que estar na
   mesma rede do PC do Holyrics.
5. **Pela internet**, com a igreja ligada à web e o celular no 4G: quanto demora entre o
   toque e o telão? Se passar de um segundo, anotar.
6. Duas pessoas ao mesmo tempo: pregador e operador tocando em Próximo no mesmo instante
   não podem pular dois slides.

## O que NÃO foi testado

Do painel do culto ao vivo (seções 12 e 13): nada rodou contra OBS, Holyrics, YouTube ou
refletor de verdade, nem em Windows. O que foi visto no Mac: os testes novos, a tela
no navegador em tela larga e em 375 px contra os simuladores, a versão web local
recebendo o retrato pelo espelho, e o painel antigo funcionando contra o código novo.

O restante, de 12/11: tudo foi verificado num Mac, com OBS, Holyrics e YouTube desligados e a luz no driver
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
3. **Ligar a igreja à web**: dois cliques em `ligar-web.bat` na pasta da ponte do
   principal. Ele pergunta a chave (o Paulo lê na VPS e digita: nunca por chat nem por
   arquivo versionado), confere com a web e grava o bloco `web:` do `config.yaml` e o
   `endereco_no_ar` do `chegada.yaml`. Fechar e abrir a ponte. Conferir que
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
