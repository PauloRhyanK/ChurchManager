# Ponte do Culto: painel do culto ao vivo

Data: 19/11/2026 · Branch: `claude/ponte-painel-ao-vivo-6f53e9` (entra pela `qa`).
Telas aprovadas: https://claude.ai/artifact/QU7o3ybrFftbDyX6hugHLu, quadros `AoVivo`, `AoVivoManual`, `AoVivoPalavra` e `PalavraCelular` (nomes, letras e números inventados).
Só mexe em `apps/ponte`. Não toca em `apps/api` nem em `apps/admin`.

## Problema

O painel de hoje (`pc/painel.html`) mostra o momento do culto e alguns botões. Quem opera ainda precisa olhar o OBS no notebook, o Holyrics no PC do telão e a tela de louvor (`/louvor`) em outra aba para saber o que está indo ao ar. E a tela de louvor conduz a música **dentro do navegador**: se a aba fecha, a letra para; se duas pessoas abrem, as duas mandam.

O painel novo junta tudo numa tela escura, igual no PC, no celular e na web, e tira a condução do navegador: quem conduz o louvor passa a ser a ponte do PC principal. As telas só mostram e pedem.

## Decisões que peço que você confirme

São as escolhas que mudam o que será construído. O resto do documento já assume a opção recomendada.

1. **Imagem do OBS só na igreja.** A web mostra o nome da cena e os números, sem a imagem. (Recomendado; detalhes em "Transmissão".)
2. **Tela nova em arquivo novo, com a antiga guardada.** A tela nova é `ao-vivo.html`; `painel.html` fica intocado e acessível em `/painel-antigo` até a nova passar por alguns cultos. (Recomendado; é o que impede quebra durante a atualização.)
3. **"Começou" à mão, enquanto o Reaper não informa a posição.** Um botão que não está no desenho: o operador toca em "Começou" na primeira batida e a ponte conta o tempo sozinha. Sem ele, nesta etapa "Sozinho" só funciona em ensaio (áudio tocando no navegador) e todo culto de verdade fica "à mão". (Recomendo incluir; é pequeno. Se preferir não, tiro.)
4. **Celular do pregador abre primeiro pelo Wi-Fi da igreja**, e o caminho pela internet entra junto com a Palavra (etapa C, abaixo), não agora. (Recomendado.)
5. **Clicar numa cena da transmissão põe no ar na hora**, sem o passo "preparar e depois pôr no ar" de hoje. É o que o desenho mostra. O botão "Pôr no ar" continua aparecendo quando o OBS tem uma cena preparada diferente.
6. **A Palavra não é construída agora.** Fica especificada aqui e entra quando o módulo Palavras disser de onde vêm os slides. Nesta entrega, no momento da palavra, o centro mostra o tempo do momento, o microfone e o que o Holyrics diz que está no telão, sem a lista de slides. (Recomendado. A alternativa é construir a tela já, com slides de exemplo num arquivo local, sabendo que o formato pode mudar.)

## Etapas

O desenho inteiro está especificado aqui, mas é construído em três etapas. O plano de implementação cobre a **A** e a **B**; a C fica especificada e espera os módulos de que depende.

| Etapa | O que entra | Depende de |
|---|---|---|
| **A** | Tela nova, topo, ordem com horários e atraso, equipamentos, transmissão (imagem, cenas, áudio, números), telão e palco, histórico, climas de luz | Nada novo |
| **B** | Louvor: condutor no servidor, Sozinho / Assumir / Segurar / Repetir o refrão / Próxima música, tela manual, relógio com fonte trocável. Alimentado pelos dados locais | Nada novo |
| **C** | Palavra (tela do operador, celular do pregador, versículos) e a leitura do módulo Cultos pela API | Módulos Cultos (etapa 2 dele) e Palavras, ainda não prontos |

## De onde vem cada informação da tela

"Existe" quer dizer que a ponte já lê hoje. "Novo" é trabalho desta entrega.

### Topo

| Na tela | De onde vem | Situação |
|---|---|---|
| Nome do culto | `ordem.nome` (ordem carregada, `config.yaml`) | Existe |
| Relógio | Hora do PC principal, no retrato; a tela anda sozinha entre uma leitura e outra | Existe (`hora`); passa a ir com segundos |
| "2 min atrasado" | Horário planejado x hora em que o operador entrou no momento | **Novo** (ver "Atraso") |
| Luzes de estado: Transmissão, Gravando, Som, Letra, Luz, Internet | `sistemas` do retrato (OBS, Holyrics, luz, espelho) + `transmissao.no_ar` / `gravando` | Existe, menos Internet (**novo**) e Som (**novo**: PC do som visto há menos de 30 s) |

### Coluna esquerda

| Na tela | De onde vem | Situação |
|---|---|---|
| Ordem do culto, momento atual, clicar para ir | `ordem` do retrato, ação `ir` | Existe |
| Hora de cada momento | Horário de início do culto + minutos de cada momento | **Novo** |
| "10 min" (quanto falta do momento atual) | Minutos planejados − tempo desde que o momento começou | **Novo** (a ponte passa a guardar a hora de entrada) |
| PC do telão | Esta máquina | Existe |
| Notebook da transmissão, PC do som | `_maquinas_vistas` (cada PC secundário se apresenta a cada pedido); para o som, também `_luz_vista` | Existe |
| TV do altar | Vigia do retorno (`vigia_tv.retrato()`) | Existe |
| Internet | Tempo de resposta do espelho + qualidade do envio do OBS | **Novo** |

### Centro (louvor)

| Na tela | De onde vem | Situação |
|---|---|---|
| "Louvor · música 2 de 4", faixa das músicas do dia | Repertório do dia (fonte local: `louvores` do config) | Dados existem; lista do dia é **nova** |
| Slide no telão, próximo slide | Texto dos slides lido do Holyrics (`GetSong`), posição decidida pelo condutor | **Novo** (hoje a tela não mostra texto) |
| Contagem "A seguir · 0:06" | Tempo do próximo slide − posição do relógio | **Novo** |
| Instrução da banda ("Bateria · entra cheia") | Linhas `//` dos slides do Holyrics (hoje viram nome de seção) | Dado existe; exibição **nova** |
| Linha do tempo com as partes | Marcas (`_marcas_louvor.json`) | Existe na `/louvor`; **nova** aqui |
| "Sozinho", "Assumir", "Segurar a letra", "Repetir o refrão", "Próxima música" | Condutor no servidor | **Novo** |
| Cinco climas, "Apagar", "Seguindo a música" | Tabela `climas` → cena + movimento que já existem (`cena_luz`, `modo_luz`) | Tabela **nova**; execução existe |

### Coluna direita

| Na tela | De onde vem | Situação |
|---|---|---|
| "No ar · 00:12:40" | `GetStreamStatus` (`outputActive`, `outputDuration`) | Existe |
| Imagem ao vivo | `GetSourceScreenshot` da cena no ar | Chamada existe no guia de chegada; uso periódico é **novo** |
| Cenas como botões | `GetSceneList` (já lida a cada 3 s; hoje só se usa a cena no ar) | Lista **nova** no retrato; ação **nova** |
| Barras de áudio | Evento `InputVolumeMeters` do OBS | **Novo** |
| Assistindo | YouTube, `concurrentViewers` | **Novo** (mesma consulta de 2 minutos) |
| Qualidade | OBS: quadros perdidos e congestionamento; YouTube: saúde do envio | **Novo** |
| Gravação (tempo) | `GetRecordStatus.outputDuration` | **Novo** (hoje só lê se está gravando) |
| Espaço no disco | `GetStats.availableDiskSpace` | **Novo** |
| Tela preta, Recado | Ações `tela_preta` e `recado` | Existe |
| Aconteceu agora | `_historico` (memória, 40 itens) | Existe; ganha anotações automáticas (**novo**) |

## Arquitetura

```
 navegadores (PC, celular)            PC principal (papel holyrics)                 fora
 ┌──────────────────────┐   1 s   ┌────────────────────────────────────┐
 │ ao-vivo.html         │◄───────►│ app.py                             │──► Holyrics (letra)
 │ só mostra e pede     │ retrato │  ├ painel_ao_vivo.py  monta retrato│──► OBS (cena, números)
 └──────────────────────┘ + ação  │  ├ condutor.py        conduz louvor│──► luz (cena + movimento)
 ┌──────────────────────┐         │  ├ relogio.py         posição      │◄── OBS (imagem, áudio)
 │ pregador.html        │◄───────►│  ├ repertorio.py      músicas      │
 └──────────────────────┘         │  ├ obs_ouvinte.py     áudio        │      2 s
        (etapa C)                 │  ├ obs_imagem.py      imagem       │─────────► web (espelho)
                                  │  └ agenda.py          horários     │   sem imagem
                                  └────────────────────────────────────┘
```

Peças novas, cada uma com uma tarefa só, em `pc/ponte/`:

| Arquivo | O que faz | Depende de |
|---|---|---|
| `agenda.py` | Dado início do culto, lista de momentos com minutos e a hora de entrada de cada um, devolve horário planejado, quanto falta e o atraso. Função pura, relógio injetado | Nada |
| `relogio.py` | Guarda a última posição informada por uma fonte e responde "em que segundo a música está agora" | Nada |
| `repertorio.py` | Entrega as músicas do dia num formato único. `FonteLocal` hoje; `FonteCultos` na etapa C | Config, marcas, Holyrics |
| `condutor.py` | A máquina de estados do louvor. Recebe relógio, repertório e três funções (pôr slide, pôr luz, anotar). Não conhece Flask | `relogio`, `repertorio` |
| `obs_ouvinte.py` | Uma conexão própria com o OBS, só para ouvir o nível de áudio | `websocket-client` (já no projeto) |
| `obs_imagem.py` | Captura a imagem do OBS sob demanda, com teto de frequência | `ClienteOBS` |
| `saude_envio.py` | Transforma os contadores do OBS em "Boa / Oscilando / Ruim". Função pura | Nada |
| `simulados.py` | OBS e Holyrics de mentira, para rodar e testar sem equipamento | Nada |

`app.py` já tem 2.742 linhas. O que é do painel novo não entra nele: a montagem do retrato novo e as ações novas ficam em `pc/ponte/painel_ao_vivo.py`, e `app.py` ganha só as rotas e a chamada. O retrato antigo (`_retrato_do_painel`) e `_acao_do_painel` continuam onde estão.

Telas novas em `pc/`: `ao-vivo.html`, `ao-vivo.css`, `ao-vivo.js` (e `pregador.html` na etapa C). Todas entram em `PACOTE`, e ganham rota no `pc/app.py` e no `web/app.py`, como `guia.js` e `guia.css`.

### Retrato e ritmo

- `GET /api/painel` continua sendo "o retrato inteiro". Todas as chaves de hoje continuam, com o mesmo significado. As novas entram ao lado: `versao_do_painel: 2`, `agenda`, `equipamentos`, `transmissao.cenas`, `transmissao.audios`, `transmissao.numeros`, `luz.climas`, `luz.seguindo`, `louvor`, `palavra`, `relogio`.
- A tela local consulta a cada **1 s** (hoje 2 s). Entre uma leitura e outra ela anda sozinha: o retrato traz `relogio: { posicao, tocando, lido_em }` e a hora do servidor, e a contagem do próximo slide e a agulha da linha do tempo são animadas no navegador. Nenhuma decisão é tomada no navegador.
- O que é grande e muda pouco (letra de todos os slides das músicas do dia; slides da palavra) vai num bloco à parte, `conteudo`, com `conteudo_versao`. Rota local `GET /api/painel/conteudo`. A tela só busca de novo quando a versão muda.
- **Para a web**: o espelho continua mandando o retrato a cada 2 s. O bloco `conteudo` só viaja quando a versão muda, ou quando a web responde que não o tem (acabou de reiniciar). Assim o envio de rotina fica do tamanho de hoje, mais os números.

## Transmissão

### Imagem do OBS

- **Como:** `GetSourceScreenshot` na cena que está no ar, formato JPEG, **480 px de largura, qualidade 50** (cerca de 15 a 25 KB por imagem). É a mesma chamada que o guia de chegada já faz em 960 px.
- **Frequência:** no máximo **uma por segundo**, e **só enquanto alguém está olhando**. A tela pede `GET /api/painel/imagem` a cada segundo; o servidor guarda a última e só captura outra se a guardada tem mais de 1 s. Com cinco telas abertas continua sendo uma captura por segundo. Sem ninguém pedindo há 5 s, nenhuma captura.
- **Conexão própria:** um terceiro cliente OBS (`obs_imagem`), para uma captura lenta nunca segurar um botão nem a leitura de estado. É o mesmo motivo dos dois clientes de hoje.
- **Só no painel local.** A web **não recebe a imagem**: 20 KB por segundo de subida, durante a transmissão, competem com o próprio envio do culto. No lugar da imagem, a web mostra a etiqueta "NO AR · LOUVOR" sobre fundo escuro e a frase "A imagem ao vivo aparece só na igreja".
- **Ajustes** no `config.yaml`, todos opcionais: `painel: { imagem: { ativo: true, intervalo: 1.0, largura: 480 } }`. E uma chave no menu Mais, "Mostrar a imagem da transmissão", para desligar na hora se o notebook sentir.
- Imagem com mais de 5 s não é mostrada como atual: some e dá lugar a "Sem imagem do OBS".
- **Só na igreja dá para saber:** quanto essa captura custa ao notebook da transmissão. O teste é ligar a transmissão num dia sem culto, abrir o painel e olhar "Quadros perdidos" nas estatísticas do OBS por 10 minutos com a imagem ligada e 10 com ela desligada.

### Cenas

- `transmissao.cenas`: lista do `GetSceneList` que a ponte já lê a cada 3 s, com os nomes limpos por `_nome_de_cena` (e `obs.apelidos`). `obs.cenas_do_painel: [...]` (opcional) escolhe quais aparecem e em que ordem; sem ele, todas.
- Ação nova `cena_transmissao { cena }`: `SetCurrentProgramScene`. Só aceita nome que o OBS acabou de listar. A que está no ar fica em destaque vermelho.
- "Pôr no ar" (`cortar`) continua existindo e aparece quando há cena preparada diferente da que está no ar.

### Nível de áudio

Hoje a ponte não lê. O cliente atual se inscreve em **zero** eventos, de propósito, para não misturar eventos com respostas. Isso não muda.

- **Conexão separada**, `obs_ouvinte.py`: abre o próprio websocket e se inscreve **só** em `InputVolumeMeters` (bit 65536 de `eventSubscriptions`). Uma thread lê, e nada mais usa essa conexão.
- O OBS manda esse evento a cada 50 ms com todas as entradas. A thread guarda, para cada entrada que interessa, **o pico dos últimos 250 ms** e descarta o resto. O retrato leva só o pico do último segundo. Custo: cerca de 20 mensagens pequenas por segundo na rede local, sem nada gravado em disco.
- Quais entradas: `obs: { audios: [ { entrada: "Mesa de som", nome: "Som do louvor" }, { entrada: "Microfone", nome: "Microfone", palavra: true } ] }`. Sem essa lista, as quatro primeiras entradas com medidor, com o nome do OBS.
- O que a tela mostra é **"tem som? está estourando?"**, não um medidor de estúdio (a barra atualiza uma vez por segundo):

| Pico | Palavra | Cor |
|---|---|---|
| Entrada no mudo, ou abaixo de −60 dB | fechado | cinza |
| −60 a −30 dB | baixo | âmbar |
| −30 a −6 dB | bom | verde |
| −6 a −1 dB | alto | âmbar |
| acima de −1 dB | estourando | vermelho |

- Se a conexão cair, o ouvinte tenta de novo a cada 10 s e as barras somem ("sem leitura"). Nada mais depende dele.
- A web recebe a palavra e a porcentagem, no retrato de 2 s.
- **Só na igreja:** os nomes reais das entradas de áudio no OBS, e se os limites da tabela batem com o que se ouve.

### Espectadores, qualidade, gravação, disco

| Número | Fonte | Frequência |
|---|---|---|
| Assistindo | YouTube: `videos.list` com `liveStreamingDetails` → `concurrentViewers` | Na consulta de 2 minutos que já existe, só com transmissão ativa (1 unidade de cota a mais por consulta) |
| Qualidade | OBS: `GetStreamStatus` (`outputSkippedFrames`, `outputTotalFrames`, `outputCongestion`, `outputReconnecting`, `outputBytes`) e `GetStats` (`renderSkippedFrames`, `outputSkippedFrames`) | A cada 3 s, na leitura de estado que já existe (uma chamada a mais: `GetStats`) |
| Saúde vista pelo YouTube | `liveStreams.list` com `status` → `healthStatus` | Na consulta de 2 minutos |
| Gravação | `GetRecordStatus.outputDuration` | A cada 3 s (chamada já feita) |
| Espaço no disco | `GetStats.availableDiskSpace` | A cada 3 s |

**Qualidade** é uma palavra, calculada em `saude_envio.py` sobre os últimos 30 s (diferença entre leituras, nunca o total desde o início):

- **Boa:** menos de 0,5% dos quadros perdidos no envio.
- **Oscilando:** de 0,5% a 5%, ou congestionamento acima de 0,5.
- **Ruim:** mais de 5%.
- **Reconectando:** o OBS diz que está reconectando.

Quem decide a palavra é o OBS, porque é o dado fresco. O que o YouTube diz aparece como detalhe ao tocar no número ("O YouTube está recebendo bem" / "mal"), com a hora da leitura. A taxa de envio (kbps, pela diferença de `outputBytes`) aparece no mesmo detalhe.

"Assistindo" mostra "—" quando o YouTube não informa (transmissão sem contador público, ou canal não autorizado). Espaço no disco fica âmbar abaixo de 20 GB e vermelho abaixo de 5 GB.

**Internet** (luz do topo e linha em Equipamentos): "boa", "lenta" ou "caiu".

- "caiu": o espelho falha há mais de 20 s.
- "lenta": o espelho leva mais de 1,5 s para ir e voltar, ou a qualidade está Oscilando ou pior.
- A ponte passa a medir quanto tempo cada volta do espelho leva (hoje guarda só se deu certo). Sem a web ligada e sem transmissão, a linha Internet não aparece: não há como saber sem inventar um teste.

## Atraso em relação ao roteiro

Enquanto o módulo Cultos não existe, os horários saem de dois dados locais:

1. **Início do culto:** a hora que o voluntário já informa no formulário do guia de chegada ("qual culto, que horas, quem veio"; `culto.hora`). Existe hoje.
2. **Minutos de cada momento:** campo novo e opcional `minutos:` na cue do momento, no `config.yaml`. E `antes: true` para o que acontece antes do início (pré-culto), que conta para trás.

O `config.yaml` é da igreja e a atualização não mexe nele. Para a tela não nascer vazia, a ponte traz os mesmos minutos do "Culto padrão" do módulo Cultos, pelos ids do `config.exemplo.yaml`: `pre_culto` 15 (antes), `abertura` 5, `louvor` 17, `avisos` 5, `ofertorio` 5, `pregacao` 40, `encerrar` 5. O `minutos:` da cue vale mais. Momento sem minutos em lugar nenhum: aparece sem hora, e os seguintes também.

Conta (`agenda.py`):

- Planejado de cada momento = início + soma dos minutos dos anteriores.
- A ponte passa a guardar a **hora em que o operador entrou** em cada momento (em `_ordem_atual.json`, ao lado do ponteiro; código antigo ignora a chave nova).
- **Atraso** = hora de entrada no momento atual − horário planejado dele. Se o momento atual já passou do fim planejado, o atraso cresce com o relógio. Menos de 1 minuto de diferença: "No horário". Senão "N min atrasado" (âmbar) ou "N min adiantado".
- **Quanto falta** = minutos planejados − tempo desde a entrada. Quando passa: "+2 min", em âmbar.
- Antes do primeiro momento: "Começa em 12 min".
- Sem a hora do culto informada: sem horários e sem atraso; a ordem aparece como hoje.

Na etapa C os horários passam a vir de `service.moments[].startsAt` e `durationMinutes` do contrato do Cultos. `agenda.py` recebe a mesma lista, de outra origem.

## Louvor

### De onde vêm as músicas: a fronteira

`repertorio.py` entrega sempre o mesmo formato, que é o do contrato do módulo Cultos (`songs[]` com `parts`, `slides`, `time`, `mood`, `cues`, `status`), em nomes da ponte:

```
musica  { id, titulo, pronta, holyrics_id, audio, duracao, partes[], slides[] }
parte   { nome, tipo, clima, luz { cena, modo }, tempo, primeiro_slide, quantos }
slide   { parte, tempo, tempo_estimado, linhas[], instrucoes[ { para, texto } ] }
```

- **`FonteLocal`** (esta entrega): `louvores` do `config.yaml` + `_marcas_louvor.json` + o texto dos slides lido do Holyrics (`GetSong`, já usado pela `/louvor`).
  - Partes: as marcas, quando existem (`segundo`, `cena`, `modo`, `slide`). Sem marcas, as `secoes` do config, sem tempo.
  - Tempo de cada slide: as marcas só dizem quando cada **parte** entra. Os slides de dentro da parte são repartidos por igual entre o início dela e o da próxima, como a `/louvor` faz hoje, e saem com `tempo_estimado: true`.
  - `pronta`: tem marcas e toda parte tem tempo. Senão é "à mão". (O arquivo de áudio só é exigido pela fonte `navegador`; com o cronômetro ou o Reaper ele não mora neste PC.)
  - Linhas que começam com `//` viram `instrucoes` e não entram em `linhas`.
  - `clima`: achado pela tabela `climas` ao contrário (a cena e o movimento da parte batem com algum clima?). Se não bate, `clima` fica vazio e a luz usa `cena` e `modo` direto.
  - Lista do dia: `louvor_do_dia: [avante, sou_grato, ...]` no config (opcional); sem ela, todos os `louvores`, na ordem.
  - Holyrics desligado ou sem responder: a música entra sem texto. A tela mostra "slide 3 de 34" no lugar da letra.
- **`FonteCultos`** (etapa C): lê `GET /public/tenants/:slug/worship/services/next` com a chave da integração, guarda a resposta em `_culto_do_dia.json` e passa a servir dali. `mood` vira `clima`; `luz` sai da tabela `climas`.
- Qual fonte usar: `repertorio: { fonte: local }` no config. A troca é essa linha.

Um ponto que o contrato do Cultos ainda não resolve e que a etapa C vai precisar: **como achar no Holyrics a música que veio do Cultos**. A ponte põe a letra no telão pelo id da música no Holyrics, e o contrato não traz esse id. Proposta para levar à sessão do Cultos: procurar pelo título exato (`SearchSong`) no pré-culto e mostrar no guia de chegada as que não foram achadas.

### Climas

Cinco chaves fixas, as mesmas do módulo Cultos. O que cada uma acende é da ponte:

```yaml
climas:
  contemplativo: { cena: oracao,     modo: respiro }
  adoracao:      { cena: louvor,     modo: lento }
  crescendo:     { cena: louvor,     modo: onda }
  celebracao:    { cena: celebracao, modo: animado }
  explosao:      { cena: celebracao, modo: batida }
```

Esses são os valores que a ponte assume quando o config não diz. Clima que aponta para cena ou movimento que este PC não tem aparece desligado, com "falta configurar". Movimento perigoso (estrobo) é recusado, como hoje.

Ação nova `clima { clima }`: aplica cena e depois movimento, na ordem em que a `/louvor` já faz. Vale para qualquer momento do culto, não só o louvor.

**"Seguindo a música" x luz na mão:** a luz tem a sua própria chave, separada da letra.

- Seguindo: o condutor troca o clima quando a música entra numa parte nova.
- Tocar num clima ou em "Apagar" durante uma música põe a luz **na mão**: o rótulo vira "Luz na mão" com o botão "Seguir a música". A letra não é afetada.
- Volta a seguir sozinha quando a próxima música começa, ou no botão.

### O relógio da música

Hoje o relógio é o `currentTime` do áudio na aba da `/louvor`. O destino é o Reaper do PC do som. O desenho que faz disso uma troca de fonte:

- **A tela nunca é o relógio.** O relógio mora no servidor (`relogio.py`).
- Uma **fonte** informa a posição por uma rota só: `POST /api/relogio { fonte, musica, posicao, tocando }`. A ponte guarda a posição e a hora em que chegou, e entre um aviso e outro anda sozinha (posição + tempo passado, se `tocando`).
- O condutor só pergunta `relogio.agora()` e recebe `(posicao, tocando, fresco)`. Ele não sabe quem é a fonte.
- Sem aviso há mais de **3 s** com `tocando`, o relógio se declara **sem sinal** e para de andar. Um salto de posição (alguém voltou a música) é só um aviso com outra posição: o condutor acerta o slide.

Fontes:

| Fonte | Quem avisa | Quando |
|---|---|---|
| `navegador` | A tela `ao-vivo.html` de **um** aparelho, tocando o `audio:` da música, 4 vezes por segundo. Fica atrás de "Tocar o áudio neste aparelho (ensaio)" no menu Mais | Esta entrega. Serve para ensaio e teste |
| `cronometro` | Ninguém: o operador toca em "Começou" e a própria ponte conta. Botões −0,5 s e +0,5 s acertam | Esta entrega, se a decisão 3 for sim |
| `reaper` | A ponte do PC do som lê a posição do Reaper e avisa a principal, 4 vezes por segundo | Etapa seguinte (áudio no Reaper). A rota já fica pronta e testada com avisos de mentira |

`relogio: { fonte: navegador }` no config escolhe qual é aceita. Aviso de fonte que não é a escolhida é ignorado. `relogio: { adiantar_ms: 0 }` adianta a letra para compensar o atraso do telão.

O que **não** se decide aqui e fica para a etapa do Reaper: como ler a posição (interface web do Reaper, OSC ou um script dele) e como saber qual música está tocando (a proposta é uma região por música, com o id no nome). A tela `/louvor` continua existindo, intocada: é nela que se marcam os tempos.

### O condutor

Uma thread no PC principal (`condutor.py`), 10 vezes por segundo. É o único que manda letra e luz durante uma música. Estado, um só para todas as telas:

```
musica_atual   índice na lista do dia
slide          índice do slide que está no telão
letra          "sozinho" | "na_mao"
segurando      sim / não        (só existe em "sozinho")
luz            "seguindo" | "na_mao"
quem           nome do aparelho que tocou por último
motivo         por que não está sozinho, quando não está
```

A cada volta, se `letra == sozinho` e não está `segurando`: acha o slide do segundo atual; se mudou, manda `ActionGoToIndex` ao Holyrics. Se `luz == seguindo` e a parte mudou: aplica o clima da parte. Só manda quando muda.

#### O que cada botão faz

**Sozinho** (etiqueta verde). A ponte passa letra e luz pelo relógio. Só existe quando a música é "pronta" **e** o relógio tem sinal. Se o relógio perde o sinal no meio da música, a letra **fica onde está**, a etiqueta vira âmbar "Sem o tempo da música" e nada mais acontece sozinho: quem decide é o operador, com Assumir.

**Assumir.** A letra passa para a mão: o condutor para de mandar slide e o centro vira a tela manual (faixa amarela, grade de slides, atalhos por parte, Anterior e Próximo, barra de espaço). O relógio continua andando por baixo e **a luz continua seguindo a música**, a não ser que alguém mexa nela. Clicar num slide ou num atalho de parte vai direto para ele; o atalho de parte também aplica o clima da parte se a luz estiver seguindo.

**Devolver.** Volta para Sozinho e a letra **pula na hora** para o slide do segundo atual. Desligado, com o motivo escrito, quando não há como: "a música não está tocando" (relógio sem sinal) ou "esta música não tem tempo marcado".

**Segurar a letra.** Em Sozinho, congela o slide que está no telão. Relógio e luz continuam. O botão vira "Soltar a letra"; ao soltar, a letra pula para o slide do segundo atual. É para o instante em que o ministro fala por cima ou estende uma frase. Solta sozinho quando a música troca. Não abre a tela manual; se o operador precisar andar com a letra, é Assumir.

**Repetir o refrão.** É "Assumir já no refrão": a letra vai para o primeiro slide do refrão mais recente (o atual, se a música está nele; senão o último que passou), a luz vai para o clima dele e o centro vira a tela manual. Dali o operador passa os slides e devolve quando a banda voltar à gravação. A ponte **não** tenta adivinhar o tempo de um refrão que a banda decidiu repetir fora da gravação. Se quem opera o áudio voltar a gravação (no Reaper, mais adiante), o relógio volta junto e a letra acompanha sem ninguém tocar em nada. Música sem nenhuma parte do tipo refrão: o botão fica desligado.

**Próxima música.** Encerra a atual, põe a seguinte no telão (`ShowLyrics`) no primeiro slide, e volta letra e luz para sozinho/seguindo se ela for pronta. Se a atual ainda está tocando, pede confirmação. Tocar numa música da faixa faz o mesmo, para aquela música. Quando o áudio chega ao fim, a ponte **não** passa sozinha: a faixa destaca a próxima e espera o toque.

**Música "à mão"** (sem tempo marcado). Não tem Sozinho, Segurar nem Devolver. O centro já abre na tela manual, com a faixa "Esta música é à mão" no lugar de "Você está no comando", e sem linha do tempo. A luz fica na mão; os atalhos de parte aplicam o clima da parte, se houver. Na faixa das músicas ela aparece como "Depois · à mão".

#### Duas pessoas e a web

- **O estado é do servidor.** PC e celular veem a mesma coisa com até 1 s de diferença. Não existe "a minha tela está em manual e a sua não".
- **Vale o último toque.** Não há trava por aparelho. Se o PC assumiu e o celular toca em "Próximo slide", o slide passa e o comando passa a ser do celular.
- **A tela sempre diz quem.** Cada navegador tem um nome, guardado nele: o PC principal usa o nome da máquina ("PC do telão"); os outros perguntam uma vez ("Como chamar este aparelho?", com "Celular" já preenchido) e dá para trocar no menu Mais. A faixa amarela diz "Você está no comando" no aparelho que tocou por último e "**PC do telão** está no comando" nos outros, com o botão "Assumir" ao lado.
- **Toque em cima de toque:** as ações de slide levam o número do slide que a tela estava mostrando. Se o servidor já saiu dele (outra pessoa tocou no mesmo instante), "Próximo" não anda duas vezes: a resposta diz "outra pessoa acabou de passar" e a tela se acerta.
- **Tudo vai para o "Aconteceu agora"**, com o nome do aparelho: "Celular assumiu a letra", "PC do telão devolveu".
- **A web vê tudo e não passa slide.** Entre o toque e o telão haveria até 4 s (a web espera a igreja ligar). As ações de louvor (`louvor_*`) ficam fora da lista da web. A web mostra a etiqueta do estado e a letra, sem "Assumir". O que a web ganha de novo: `clima` e `cena_transmissao`, que são do mesmo tipo de `cena_luz` e `cortar`, que ela já tem.

## Palavra (etapa C)

Especificada para o desenho ficar inteiro; não é construída agora, porque os slides vêm do módulo Palavras, que ainda não tem especificação.

### Quem passa os slides

- O pregador, pelo celular, e o operador, pelo painel. **Vale o último toque**, com a mesma regra do louvor (o toque leva o número do slide que a tela mostrava).
- A tela sempre diz quem tocou por último: "O pregador está passando" ou "**PC do telão** está passando". O botão "Assumir" do operador não trava o pregador: ele marca o operador como quem está passando e mostra isso também no celular ("A equipe está passando os slides"). Se o pregador tocar de novo, volta a ser ele.
- "Tirar do telão" esconde o slide (tela vazia do Holyrics) sem perder o lugar; "Próximo" ou "Anterior" trazem de volta.
- Tempo: "12 de 40 min" sai da `agenda` (momento atual). O microfone é a entrada marcada com `palavra: true` em `obs.audios`.

### Como o celular do pregador abre

- O operador toca em "Celular do pregador" no painel. A ponte sorteia um código (`secrets.token_urlsafe(16)`) e mostra um QR code e o endereço.
- **O link só vale naquele culto.** Morre quando: o operador toca em "Encerrar o acesso"; a ordem do culto é trocada ou recomeçada; passam 6 horas; ou a ponte reinicia sem culto em andamento. Um link novo mata o anterior. O código fica só na memória e em `_pregador.json` (fora do Git e do pacote).
- A página (`pregador.html`) só sabe fazer duas coisas: Anterior e Próximo. Mostra o slide no telão, as anotações do ponto, o que vem a seguir e o tempo. Não tem menu, não vê o resto do painel.

**Pelo Wi-Fi da igreja** (primeiro, e o recomendado para o culto): `http://<ip do PC principal>:8700/pregador/<código>`. O celular fala direto com o PC. Sem atraso, e funciona sem internet.

**Pela internet** (para o pregador que está no 4G): `https://ponte.igrejaparaiso.com.br/pregador/<código>`. Respeita a regra de que a igreja liga para a web:

- A igreja entrega no espelho, junto do retrato, **o resumo (SHA-256) do código**, a validade e o retrato da palavra. O código em si nunca vai para a web por iniciativa da igreja.
- A web serve `/pregador/<código>` **sem a senha da equipe** se o resumo do código pedido bate com o que a igreja entregou, a validade não passou e a igreja está viva. Senão, 404. Limite de tentativas por endereço, como no login.
- O toque do pregador entra na fila de pedidos com o tipo `pregador` (`proximo` ou `anterior`, mais o número do slide). A igreja busca, confere o código outra vez do lado dela e executa. A web nunca chama a igreja.
- **Atraso:** com o espelho a cada 2 s, o toque levaria até 2 s para chegar. Enquanto houver link de pregador válido, a ponte abre um **segundo pedido de saída, de espera longa** (`POST /api/espelho/pedidos`, até 20 s pendurado), que a web responde no instante em que um toque chega. A web já roda com 8 threads num processo só; isso ocupa uma. Atraso esperado: menos de meio segundo, mais a internet do celular.
- A chave "Aceita comandos / Só mostra" do painel não corta o pregador: o link dele é uma autorização à parte, dada naquele culto e que o operador encerra num toque.

### Versículos

Mandar **só a referência** ("Salmos 119:105") e deixar o Holyrics exibir, com a Bíblia, a versão e o tema que a igreja já usa lá.

- Ação do Holyrics: `ShowVerse`, com a referência em texto. **Este nome e o formato do pedido precisam ser confirmados na instalação da igreja (2.30.0)**; os nomes de ação mudam entre versões, e essa ação não está na lista que o `descobrir_holyrics.py` testa hoje.
- **Como conferir a permissão:** no Holyrics cada token tem permissão por ação. A ponte ganha um verificador (`python descobrir_holyrics.py --palavra`, e a mesma checagem no guia de chegada, como medida `holyrics_versiculo`) que chama a ação e lê a resposta: `unauthorized action` quer dizer "existe, falta liberar"; 404 quer dizer "não existe nesta versão"; qualquer outra resposta, "liberada". O teste é feito com a tela preta do Holyrics ligada, ou fora do culto, porque a ação mostra o versículo de verdade.
- **Se faltar a permissão:** o guia de chegada mostra o passo "Liberar versículos no Holyrics" (Arquivo > Configurações > API Server > permissões do token > marcar a ação). É um clique, uma vez.
- **Se não houver como** (a ação não existe, ou a igreja prefere não liberar): a ponte não manda o versículo. O slide aparece no painel com a marca "abrir no Holyrics" e a referência em destaque; o operador abre à mão, como hoje, e toca em Próximo para a lista seguir. O celular do pregador continua mostrando as anotações. A ponte **não** escreve o texto do versículo no telão por conta própria: sairia com outra versão e outra cara.
- Slides que não são versículo (título, ponto) dependem de uma ação de texto do Holyrics, com a mesma checagem. O formato desses slides é do módulo Palavras.

## Quando algo falha

| O que aconteceu | O que a tela mostra | O que continua |
|---|---|---|
| **Internet caiu** | Internet "caiu" (vermelho) no topo e em Equipamentos; "Assistindo" e a saúde do YouTube ficam com a hora da última leitura; anotado no histórico | Tudo que é local: ordem, louvor, letra, luz, OBS, imagem, áudio. A web passa a dizer "Sem contato com a igreja há N segundos". O celular do pregador pela internet para e mostra "Sem contato. Conecte no Wi-Fi da igreja", com o endereço local |
| **OBS não responde** | Luz "Transmissão" vermelha com a frase de hoje; a imagem some ("Sem contato com o OBS"); botões de cena desligados; números com "—"; barras somem | Louvor, letra, luz, ordem. A ordem troca de momento e avisa quais passos falharam, como hoje |
| **Holyrics não responde** | Luz "Letra" vermelha; a caixa "No telão" ganha a faixa "A letra não chegou ao telão" | O condutor segue o relógio e a luz. Para a letra: uma segunda tentativa 0,7 s depois, e depois só no próximo slide (nunca uma tentativa atrás da outra). Em modo manual, o botão responde com o erro |
| **PC do som sumiu** | Luz "Som" e "Luz" vermelhas; linha em Equipamentos | Tudo menos a luz |
| **Relógio sem sinal no meio da música** | Etiqueta âmbar "Sem o tempo da música"; a letra fica no slide em que estava | O operador assume |
| **Música sem tempo marcado** | "À mão" na faixa e no centro (ver acima) | Tudo, na mão |
| **Música sem letra lida** (Holyrics fora quando a ponte montou o repertório) | "slide 3 de 34" no lugar do texto; tenta ler de novo a cada minuto | Os slides passam normalmente |
| **A ponte reinicia no meio do culto** | Volta no mesmo momento da ordem (já existe). O louvor volta na mesma música, **na mão** | O operador devolve quando o relógio tiver sinal |
| **Imagem pesa no notebook** | Chave "Mostrar a imagem da transmissão" no menu Mais | Tudo |

Mudança de estado dos equipamentos passa a ser anotada sozinha no "Aconteceu agora" ("Internet ficou lenta", "O OBS parou de responder", "O OBS voltou"), só na virada, nunca repetida.

## Compatibilidade

### As ações continuam uma lista fechada

Nada de "rode esta cue". Entram em `_acao_do_painel` (a implementação mora em `painel_ao_vivo.py`):

| Ação | Corpo | Web pode pedir? |
|---|---|---|
| `cena_transmissao` | `cena` (nome que o OBS listou) | Sim |
| `clima` | `clima` (uma das cinco chaves) | Sim |
| `luz_seguir` | — | Não |
| `louvor_assumir`, `louvor_devolver` | `quem` | Não |
| `louvor_segurar` | `segurar` (sim / não) | Não |
| `louvor_slide` | `para` (`proximo`, `anterior` ou índice), `visto` (slide que a tela mostrava), `quem` | Não |
| `louvor_parte` | `parte` (índice), `quem` | Não |
| `louvor_repetir_refrao` | `quem` | Não |
| `louvor_musica` | `para` (`proxima` ou id da lista do dia) | Não |
| `louvor_comecou`, `louvor_acertar` | — / `segundos` (se a decisão 3 for sim) | Não |
| `imagem` | `mostrar` (sim / não) | Não |

Etapa C: `palavra_slide`, `palavra_assumir`, `palavra_tirar`, `pregador_link` (gerar / encerrar), todas só locais; e o tipo de pedido `pregador`, que é o único jeito de a web passar slide.

A lista da web (`ACOES_DO_PAINEL` em `web/app.py`) ganha só `cena_transmissao` e `clima`. A igreja confere de novo, como hoje.

### Nada quebra durante a atualização

Os PCs e a VPS não atualizam no mesmo instante, e o PC do som roda código bem antigo. Regras:

1. **`/api/painel` só cresce.** Nenhuma chave de hoje some nem muda de sentido. Um teste compara o conjunto de chaves do retrato novo com a lista das chaves de hoje.
2. **`painel.html` não é tocado.** A tela nova é outro arquivo. No PC, `/` passa a servir `ao-vivo.html` e `/painel-antigo` serve `painel.html`. No menu Mais da tela nova há "Abrir o painel antigo", para o domingo em que a nova der problema.
3. **Web nova, igreja antiga:** o retrato que chega não tem `versao_do_painel`. A web serve `painel.html` em `/painel`, como hoje. Quando a igreja atualiza, o retrato passa a trazer `versao_do_painel: 2` e a web serve `ao-vivo.html`.
4. **Igreja nova, web antiga:** a web antiga serve o `painel.html` dela e ignora as chaves novas do retrato. As ações novas ela recusa, porque não estão na lista dela. Os campos novos do espelho (`conteudo`) ela ignora.
5. **PC do som antigo:** só busca o quadro de luz (`/api/luz/quadro`), que não muda. Clima é cena + movimento que já existem; nenhuma chave nova viaja para ele.
6. **Notebook antigo:** continua se apresentando e lendo o guia; nada dele muda.
7. **A `/louvor`** e as rotas `/api/louvor/*` continuam como estão. Se a `/louvor` e o condutor mandarem letra ao mesmo tempo, vale o último, como já acontece hoje entre uma cue e a mesa de luz. No culto usa-se uma ou outra; a `/louvor` fica para marcar os tempos.
8. **Arquivos novos** entram em `PACOTE`: `ao-vivo.html`, `ao-vivo.css`, `ao-vivo.js`. Os `.py` novos estão em `ponte/`, que já vai inteira. Nenhum `.ps1` é alterado.
9. **Nada de segredo novo** nesta entrega. `_pregador.json` (etapa C) segue a regra dos `_*.json`: fora do Git e do pacote.
10. **Dependências:** nenhuma nova. O ouvinte usa o `websocket-client` que já está no `requirements.txt`. O QR code da etapa C é desenhado no navegador.

## Textos

Tudo em pt-BR, sem "cue", "look", "preset", "DMX", "OBS" em rótulo de botão (aparece só em mensagem de erro que diz o que abrir), "stream" ou "bitrate". Os rótulos são os do desenho. Onde o desenho diz "Câmera na transmissão" para o grupo das cenas, o texto para leitor de tela é esse.

## Como rodar e testar sem equipamento

- **`PONTE_SIMULAR=1`** (variável de ambiente, nunca no config): troca OBS e Holyrics pelos de `simulados.py`. O OBS de mentira tem cenas, transmissão e gravação que ligam e desligam, contadores que andam, níveis de áudio que se mexem e uma imagem gerada com a hora. O Holyrics de mentira tem as músicas do `config.exemplo.yaml` com letra inventada. A tela mostra uma faixa "SIMULAÇÃO" enquanto isso estiver ligado. É assim que o painel roda inteiro num Mac.
- **Testes novos**, no estilo dos `_testar_*.py` (sem equipamento, relógio injetado, `python _testar_x.py`):
  - `_testar_agenda.py`: horários, pré-culto para trás, atraso, "quanto falta", momento sem minutos, sem hora do culto.
  - `_testar_relogio.py`: anda entre avisos, para sem sinal, salto de posição, fonte errada ignorada.
  - `_testar_repertorio.py`: marcas viram partes e slides; slides repartidos dentro da parte; `//` vira instrução; pronta x à mão; sem Holyrics.
  - `_testar_condutor.py`: segue o relógio; só manda quando muda; segurar e soltar; assumir e devolver; repetir o refrão; próxima música; música à mão; relógio sem sinal; Holyrics falhando sem enxurrada; dois toques no mesmo slide; luz na mão x seguindo.
  - `_testar_saude_envio.py`: as quatro palavras, janela de 30 s, contadores que zeram quando a transmissão reinicia.
  - `_testar_audio_obs.py`: pico por janela, a tabela de palavras, entrada no mudo, mensagens malformadas.
  - `_testar_painel_ao_vivo.py`: retrato novo contém todas as chaves antigas; ação desconhecida é recusada; ações de louvor recusadas quando a origem é a web; `cena_transmissao` só aceita cena listada; `PACOTE` contém os arquivos novos; a web serve a tela certa conforme `versao_do_painel`.
- Os testes antigos são rodados todos. Dois já falham hoje na checagem "o pan fica dentro do limite" (`_testar_movimento.py`, `_testar_agente.py`); isso não é desta entrega e será apontado, não escondido.

## O que só pode ser conferido na igreja

Vai virar uma seção nova em `apps/ponte/docs/PARA-A-SESSAO-DO-PC.md`, com o passo a passo:

- A imagem do OBS: se chega, se o tamanho serve, e quanto custa ao notebook (quadros perdidos com e sem ela).
- O nível de áudio: nomes das entradas, se o evento chega pela rede, se "bom" e "estourando" batem com o ouvido.
- Trocar de cena pelo painel com o OBS de verdade, em modo estúdio e fora dele.
- Os números: tempo de gravação, espaço no disco, qualidade durante uma transmissão de teste, e "Assistindo" com alguém assistindo.
- Os cinco climas no refletor: se cada um parece o nome que tem.
- O condutor com o Holyrics de verdade: atraso entre o pedido e a letra no telão (para acertar `adiantar_ms`), e se `GetSong` devolve o texto dos slides com o token da igreja.
- A tela no monitor do PC do telão e num celular na rede da igreja; duas pessoas ao mesmo tempo.
- A atualização: PC principal novo com a web antiga, e o contrário.

## Fora desta entrega

- Palavra, celular do pregador, versículos e a leitura do módulo Cultos (etapa C; especificados acima).
- Ler a posição do Reaper (etapa do áudio no Reaper). A rota do relógio fica pronta.
- Apagar `painel.html`: depois de alguns cultos com a tela nova, em outra mudança.
- Trocar a máquina principal sozinha, mandar a imagem para a web, medidor de áudio em tempo real, e qualquer mudança no PC do som.
