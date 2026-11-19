# Ponte: painel do culto ao vivo (etapas A e B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela nova do culto ao vivo (`ao-vivo.html`) rodando no PC, no celular e na web, com transmissão, equipamentos, horários, climas e o louvor conduzido pelo servidor.

**Architecture:** Módulos pequenos e sem Flask em `apps/ponte/pc/ponte/` (agenda, relógio, repertório, condutor, saúde do envio, ouvinte e imagem do OBS, simulados), juntados por `painel_ao_vivo.py`. `app.py` ganha só rotas e a ligação. O retrato antigo e `painel.html` não mudam.

**Tech Stack:** Python 3, Flask, `websocket-client`, `requests` (já no projeto). HTML, CSS e JS sem framework. Testes: scripts `_testar_*.py` com `conferir()`, sem equipamento.

**Spec:** `docs/superpowers/specs/2026-11-19-ponte-painel-ao-vivo-design.md` (as seis decisões foram aprovadas na opção recomendada, incluindo o botão "Começou").

## Global Constraints

- Só `apps/ponte`. Nada em `apps/api` nem `apps/admin`. Sem deploy, sem push na `main`, sem merge na `qa`.
- `/api/painel` só cresce: nenhuma chave de hoje some ou muda de sentido. `painel.html` não é editado.
- Ações do painel são lista fechada. A web só ganha `cena_transmissao` e `clima`.
- Textos de tela em pt-BR, sem "cue", "look", "preset", "DMX", "stream", "bitrate".
- Arquivo novo de `pc/` (fora de `ponte/`) entra em `PACOTE`. Nenhum `.ps1` muda. Nenhuma dependência nova. Nenhum segredo no Git.
- A igreja liga para a web, nunca o contrário. A imagem do OBS não vai para a web.
- Todos os caminhos abaixo são relativos a `apps/ponte/`. Testes rodam de `pc/` com `python3 _testar_x.py` e terminam com código 0.

## Review Focus

1. Holyrics fora do ar durante uma música: o condutor não pode disparar um pedido por volta (10 por segundo). Teste em `_testar_condutor.py`.
2. Dois aparelhos tocam "Próximo" no mesmo slide: anda uma vez só. Teste em `_testar_condutor.py`.
3. Contadores do OBS zeram quando a transmissão reinicia: a qualidade não pode virar número negativo nem "Ruim". Teste em `_testar_saude_envio.py`.
4. Marcas com `slide` repetido ou fora de ordem (a música "avante" tem Intro e Verso 1 no slide 0): nenhuma parte fica com zero slides. Teste em `_testar_repertorio.py`.
5. Culto que atravessa a ordem sem hora informada, ou momento sem minutos: a tela mostra a ordem sem horários, sem erro. Teste em `_testar_agenda.py`.

---

### Task 1: `agenda.py` (horários e atraso)

**Files:** Create `pc/ponte/agenda.py`, `pc/_testar_agenda.py`

**Interfaces — Produces:**
- `PADRAO: dict[str, tuple[int, bool]]` = `pre_culto (15, True)`, `abertura (5, False)`, `louvor 17`, `avisos 5`, `ofertorio 5`, `pregacao 40`, `encerrar 5`.
- `minutos_de(cue_id: str, cue: dict) -> tuple[int | None, bool]`: `cue["minutos"]` e `cue["antes"]` valem mais que `PADRAO`.
- `calcular(inicio: str | None, momentos: list[dict], atual: int | None, entradas: dict[str, float], agora: float) -> dict` com `momentos` = `[{id, minutos, antes}]`. Devolve `{"inicio", "momentos": [{"id", "hora": "HH:MM" | None, "minutos", "resta_s": int | None}], "atraso_s": int | None, "estado": "antes" | "no_horario" | "atrasado" | "adiantado" | None, "texto": str | None}`.

Regras: momentos `antes` no começo da lista contam para trás a partir do início; os outros para a frente; depois de um momento sem minutos, `hora` é `None`. `atraso_s` = entrada do atual − planejado; se `agora` passou do fim planejado do atual, vale o maior entre isso e `agora − fim`. |atraso| < 60 → "No horário". Textos: "N min atrasado", "N min adiantado", "Começa em N min".

- [ ] Teste: início 19:00, ordem do exemplo → horas 18:45, 19:00, 19:05, 19:22, 19:27, 19:32, 20:12.
- [ ] Teste: entrou no louvor às 19:07 → `atraso_s == 120`, texto "2 min atrasado"; às 19:05:30 → "No horário"; às 19:02 → "3 min adiantado".
- [ ] Teste: no louvor desde 19:05, agora 19:30 → atraso 480 (passou do fim 19:22), `resta_s == -480`.
- [ ] Teste: sem `inicio` → todas as horas `None`, `texto None`. Momento desconhecido no meio → `hora None` dele em diante. Antes do início, sem momento atual → "Começa em 12 min".
- [ ] Implementar, rodar, commit.

### Task 2: `saude_envio.py`

**Files:** Create `pc/ponte/saude_envio.py`, `pc/_testar_saude_envio.py`

**Interfaces — Produces:** `class SaudeDoEnvio(janela=30.0)` com `ler(agora: float, ativo: bool, perdidos: int, total: int, bytes_: int, congestao: float, reconectando: bool) -> None` e `retrato() -> {"palavra": "Boa" | "Oscilando" | "Ruim" | "Reconectando" | None, "perdidos_pct": float | None, "kbps": int | None}`.

Limites da spec: < 0,5% Boa; 0,5 a 5% ou congestão > 0,5 Oscilando; > 5% Ruim. Sempre pela diferença entre a leitura mais antiga da janela e a mais nova. Contador que diminui → zera a janela.

- [ ] Testes: as quatro palavras; inativo → `palavra None`; perdas antigas (fora dos 30 s) não contam; contador zerando não dá negativo; `kbps` pela diferença de bytes.
- [ ] Implementar, rodar, commit.

### Task 3: `obs_ouvinte.py` (nível de áudio)

**Files:** Create `pc/ponte/obs_ouvinte.py`, `pc/_testar_audio_obs.py`

**Interfaces — Produces:**
- `pico_db(niveis: list) -> float` (maior pico entre os canais, em dB; vazio ou zero → `-100.0`).
- `palavra(db: float) -> tuple[str, str, int]` → (`fechado|baixo|bom|alto|estourando`, `cinza|ambar|verde|ambar|vermelho`, porcentagem 0–100 com −60 dB = 0 e 0 dB = 100).
- `class Medidor(agora=time.monotonic)`: `receber(inputs: list[dict]) -> None` (formato do evento: `[{inputName, inputLevelsMul}]`), `retrato(entradas: list[dict] | None) -> list[{"nome", "entrada", "estado", "cor", "nivel", "palavra": bool}]` (pico do último 1 s; sem lista, as 4 primeiras vistas; sem leitura há 3 s → lista vazia).
- `class OuvinteOBS(host, porta, senha, medidor)`: `comecar()`, `vivo() -> bool`. Conexão própria, `eventSubscriptions: 65536`, reconecta a cada 10 s.

- [ ] Testes: tabela de palavras nos limites (−61, −60, −30, −6, −1, 0); pico por janela (um pico de 0,9 há 0,5 s ainda vale; há 2 s não); mensagem malformada não estoura; nomes da config trocam o rótulo.
- [ ] Implementar, rodar, commit.

### Task 4: `obs_imagem.py` e `simulados.py`

**Files:** Create `pc/ponte/obs_imagem.py`, `pc/ponte/simulados.py`; testes dentro de `pc/_testar_painel_ao_vivo.py` (Task 8)

**Interfaces — Produces:**
- `class ImagemDoOBS(cliente, cena_no_ar: Callable[[], str | None], intervalo=1.0, largura=480, qualidade=50, agora=time.monotonic)`: atributo `ativo: bool`; `pegar() -> tuple[bytes | None, str, float | None]` (bytes, mimetype, idade em s). Captura só se a guardada tem mais que `intervalo`; chamadas simultâneas dividem uma captura; falha → guarda `None`.
- `simulados.ObsSimulado()` com `pedir(tipo, dados=None)`, `cenas()`, `versao()`, `definir_visibilidade(...)`: responde `GetSceneList`, `GetRecordStatus`, `GetStreamStatus`, `GetStats`, `GetSourceScreenshot` (PNG gerado com `zlib`), `SetCurrentProgramScene`, `SetCurrentPreviewScene`, `StartStream`, `StopStream`, `StartRecord`, `StopRecord`, `TriggerStudioModeTransition`, `GetVersion`. `niveis() -> list[dict]` no formato do evento.
- `simulados.HolyricsSimulado()` com `pedir(acao, payload=None)`: `GetCurrentPresentation`, `GetF10`, `SetF10`, `GetSong` (40 slides com letra inventada e marcadores `//`), `ShowLyrics`, `ActionGoToIndex`, `CloseCurrentPresentation`. Guarda `historico: list` dos pedidos.

- [ ] Implementar; commit junto da Task 8.

### Task 5: `relogio.py`

**Files:** Create `pc/ponte/relogio.py`, `pc/_testar_relogio.py`

**Interfaces — Produces:** `class Relogio(fonte="navegador", adiantar_ms=0, agora=time.monotonic, validade=3.0)`:
- `avisar(fonte: str, musica: str, posicao: float, tocando: bool) -> bool` (falso se a fonte não é a escolhida).
- `comecar(musica: str) -> bool`, `acertar(segundos: float) -> None`, `parar() -> None` (só agem com fonte `cronometro`; `parar` vale para qualquer uma).
- `ler() -> {"fonte", "musica", "posicao": float | None, "tocando": bool, "sinal": bool}`.

Sem aviso há mais de `validade` → `sinal False` e a posição para em último + `validade`. `cronometro` nunca perde o sinal. `posicao` já sai com `adiantar_ms` somado.

- [ ] Testes: anda entre avisos; pausado não anda; perde o sinal aos 3 s; salto para trás; fonte errada ignorada; cronômetro começa em 0, `acertar(+0.5)`, não perde sinal; `adiantar_ms`.
- [ ] Implementar, rodar, commit.

### Task 6: `repertorio.py`

**Files:** Create `pc/ponte/repertorio.py`, `pc/_testar_repertorio.py`

**Interfaces — Produces:**
- `CLIMAS = ("contemplativo", "adoracao", "crescendo", "celebracao", "explosao")`, `NOMES` (com acento), `CLIMAS_PADRAO` (valores da spec).
- `tabela_de_climas(config: dict, cenas: Iterable[str], modos: Iterable[str]) -> list[{"id", "nome", "cena", "modo", "disponivel": bool}]` (`modos` já sem os perigosos; `parado` sempre vale).
- `clima_de(cena, modo, tabela) -> str | None`.
- `tipo_da_parte(nome: str) -> "intro" | "verso" | "pre_refrao" | "refrao" | "ponte" | "instrumental" | "final" | "outra"`.
- `montar_musica(louvor: dict, marcas: list[dict], slides: list[dict] | None, tabela: list, duracao: float | None = None) -> dict` no formato da spec, com `slides[]` sendo a **sequência** que o telão percorre; cada item tem também `indice` (o índice no Holyrics) e `total_slides`.
- `class FonteLocal(config, ler_marcas: Callable[[], dict], ler_slides: Callable[[str], list | None], tabela: Callable[[], list])`: `musicas() -> list[dict]`, `versao() -> str` (12 caracteres do sha1 do conteúdo), `recarregar() -> None`. Guarda o resultado; música sem texto é relida depois de 60 s.

Regras: `pronta` = tem marcas e toda parte tem tempo (a spec dizia também "tem áudio"; com o cronômetro o áudio não é exigido, e a spec foi ajustada). Partes sem marcas vêm de `secoes`, sem tempo. `quantos` = distância até o `slide` da próxima parte, no mínimo 1; a última vai até o fim. Tempo dos slides de dentro da parte: repartido por igual até a próxima parte (última: até `duracao`, ou 4 s por slide), com `tempo_estimado: True`. Linha `//Bateria: entra cheia` → `{"para": "Bateria", "texto": "entra cheia"}`; sem dois-pontos → `para: "Banda"`.

- [ ] Testes: os listados na spec, mais o caso 4 do Review Focus e "lista do dia" (`louvor_do_dia`).
- [ ] Implementar, rodar, commit.

### Task 7: `condutor.py`

**Files:** Create `pc/ponte/condutor.py`, `pc/_testar_condutor.py`

**Interfaces — Consumes:** `Relogio.ler()`, `Relogio.comecar/acertar/parar`, `FonteLocal.musicas()`.

**Produces:** `class Condutor(relogio, musicas: Callable[[], list], mostrar_musica: Callable[[dict], None], por_slide: Callable[[dict, dict], None], por_luz: Callable[[dict], None], anotar: Callable[[str, bool, str], None], agora=time.monotonic)`:
- `passo() -> None` (uma volta), `comecar() -> None` (thread, 10 por segundo).
- `retrato() -> dict` com `ativo, indice, total, musica {id, titulo, pronta}, slide, total_slides, parte, letra ("sozinho" | "na_mao"), segurando, luz ("seguindo" | "na_mao"), quem, motivo, pode_devolver, motivo_devolver, tem_refrao, proximo_em, erro_letra, lista [{id, titulo, pronta, estado: "tocou" | "tocando" | "a_seguir" | "depois"}], relogio {...}`.
- Ações, todas devolvendo `(corpo: dict, codigo: int)` com `corpo["titulo"]` para o histórico: `assumir(quem)`, `devolver(quem)`, `segurar(sim: bool, quem)`, `ir_slide(para: str | int, visto: int | None, quem)`, `ir_parte(indice: int, quem)`, `repetir_refrao(quem)`, `ir_musica(para: str)`, `seguir_luz()`, `luz_na_mao()`, `comecou()`, `acertar(segundos: float)`.

Comportamento: exatamente o da seção "O condutor" da spec. Falha ao pôr slide: uma nova tentativa 0,7 s depois, e depois só quando o slide mudar. `ir_slide` com `visto` diferente do slide atual → 409 "outra pessoa acabou de passar". Ao reiniciar com música já escolhida: `na_mao`.

- [ ] Testes: todos os de `_testar_condutor.py` da spec + casos 1 e 2 do Review Focus.
- [ ] Implementar, rodar, commit.

### Task 8: `painel_ao_vivo.py` e a ligação no `app.py`

**Files:** Create `pc/ponte/painel_ao_vivo.py`, `pc/_testar_painel_ao_vivo.py`. Modify `pc/app.py`, `pc/ponte/espelho.py`, `pc/ponte/youtube.py`, `pc/config.exemplo.yaml`.

**Interfaces — Produces:**
- `painel_ao_vivo.ACOES` (todas as novas) e `ACOES_DA_WEB = ("cena_transmissao", "clima")`.
- `class PainelAoVivo(dep: dict)`; `dep` traz o que o módulo precisa do `app.py` como funções: `config`, `estado_obs`, `cliente_obs`, `cliente_luz`, `looks`, `motor`, `ordem`, `cues`, `culto`, `maquinas`, `espelho`, `vigia`, `nome_de_cena`, `anotar`, `condutor`, `repertorio`, `medidor`, `imagem`, `saude`, `agora`.
- `PainelAoVivo.completar(base: dict) -> dict` (acrescenta `versao_do_painel: 2`, `agora`, `agenda`, `equipamentos`, `internet`, `transmissao.cenas|audios|numeros`, `luz.climas|seguindo`, `louvor`, `relogio`, `conteudo_versao`, `imagem`, `simulacao`).
- `PainelAoVivo.conteudo() -> {"versao", "musicas"}`.
- `PainelAoVivo.acao(tipo, dados, origem) -> tuple[dict, int] | None` (`None` = não é ação nova).
- `PainelAoVivo.vigiar_viradas(sistemas: list) -> None` (anota "X parou de responder" / "X voltou" só na virada).

`app.py`: `_ler_estado_obs` passa a guardar `cenas`, `gravacao_ms`, contadores do envio e `GetStats`; `_transicionar` guarda a hora de entrada em `_ordem["entradas"]` e `_salvar_ponteiro` grava; `_retrato_do_painel` termina chamando `completar`; `_acao_do_painel` tenta `acao()` antes do `else` final; `PONTE_SIMULAR=1` troca os clientes; rotas novas `GET /` → `ao-vivo.html`, `GET /painel-antigo`, `GET /ao-vivo.css`, `GET /ao-vivo.js`, `GET /api/painel/conteudo`, `GET /api/painel/imagem`, `POST /api/relogio`; `PACOTE` ganha os três arquivos. `espelho.py`: mede o tempo de cada volta (`ms` no retrato) e manda `conteudo` só quando a versão muda ou a web pede (`quer_conteudo`). `youtube.py`: `espectadores(id_video) -> int | None` e `saude_do_envio(id_stream) -> str | None`.

- [ ] Testes: os de `_testar_painel_ao_vivo.py` da spec (chaves antigas presentes; ação desconhecida recusada; `louvor_*` recusada com origem `web`; `cena_transmissao` só com cena listada; `clima` aplica cena e depois movimento; `PACOTE`), mais `ImagemDoOBS` (uma captura por segundo com cinco pedidos; desligada não captura).
- [ ] Implementar, rodar todos os `_testar_*.py`, commit.

### Task 9: a versão web

**Files:** Modify `web/app.py`. Teste em `pc/_testar_painel_ao_vivo.py` (importa `web/app.py` com as variáveis de ambiente de teste).

- `ACOES_DO_PAINEL` ganha `cena_transmissao` e `clima`.
- `/painel` serve `ao-vivo.html` quando o último retrato tem `versao_do_painel >= 2`; senão `painel.html`. `/painel-antigo` serve sempre `painel.html`. Rotas `/ao-vivo.css` e `/ao-vivo.js`.
- `/api/espelho` guarda `conteudo` quando vem e responde `quer_conteudo: true` enquanto não tem o da versão anunciada. `GET /api/painel/conteudo` devolve o guardado. `GET /api/painel/imagem` responde 404.

- [ ] Testes, implementar, rodar, commit.

### Task 10: a tela (`ao-vivo.html`, `ao-vivo.css`, `ao-vivo.js`)

**Files:** Create os três em `pc/`.

**Consumes:** `GET /api/painel` (1 s local, 2 s na web), `GET /api/painel/conteudo`, `GET /api/painel/imagem`, `POST /api/painel/acao`, `POST /api/relogio`, `POST /api/painel/remoto`, `POST /api/painel/atualizar`, `POST /api/atualizacao/conferir`.

- Cores, medidas e rótulos dos quadros `AoVivo` e `AoVivoManual`. Três colunas que viram uma no celular.
- Centro: louvor quando o momento atual é o do louvor (`painel.momento_do_louvor`, padrão `louvor`) ou há música tocando; senão o cartão do momento (nome, o que ele faz, tempo, o que está no telão, microfone, botão do próximo momento).
- Tela manual, barra de espaço = próximo slide, nome do aparelho no `localStorage`, botão "Começou" e ±0,5 s quando a fonte é o cronômetro, tocador de ensaio no menu Mais quando a fonte é o navegador.
- Menu Mais com o que o painel antigo tem (ordem de hoje, comandos pela web, atualização, PCs, outras telas) mais "Abrir o painel antigo" e "Mostrar a imagem da transmissão".
- Na web: sem imagem, sem ações de louvor, faixa "Sem contato com a igreja" como hoje.

- [ ] Construir; subir com `PONTE_SIMULAR=1` e conferir cada área no navegador, em tela larga e em 390 px; commit.

### Task 11: documentação e fecho

**Files:** Modify `docs/PARA-A-SESSAO-DO-PC.md`, `README.md`, a spec (ajuste do `pronta`).

- [ ] Seção nova "Painel do culto ao vivo (19/11/2026)": o que mudou, o que foi verificado no Mac e a lista do que conferir na igreja (da spec).
- [ ] Rodar todos os `_testar_*.py`, anotar o resultado (incluindo as duas falhas antigas), commit.
