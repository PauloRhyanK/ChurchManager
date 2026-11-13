"""Ponte do culto — servidor do painel.

Sobe um servidor local que serve o painel de botoes e, a cada clique, roda a
cue correspondente contra OBS, Holyrics e luzes.

Rode pelo INICIAR.bat. Para parar, feche a janela.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time

import yaml
from flask import Flask, Response, jsonify, request, send_from_directory

from ponte import chegada as mod_chegada
from ponte import espelho as mod_espelho
from ponte import luzes as mod_luzes
from ponte import mesa as mod_mesa
from ponte import movimento as mod_movimento
from ponte import seguidor as mod_seguidor
from ponte import youtube as mod_youtube
from ponte.cues import executar
from ponte.holyrics import ClienteHolyrics
from ponte.obs import ClienteOBS

RAIZ = os.path.dirname(os.path.abspath(__file__))

# PONTE_CONFIG permite subir uma SEGUNDA instancia da mesma pasta, com outro
# config. E o que torna possivel testar o par agente/seguidor numa maquina so,
# sem hardware e sem a outra maquina: uma instancia guarda o quadro, a outra
# busca e manda Art-Net. Sem isto, o caminho inteiro so poderia ser conferido
# na igreja, com a luz ligada.
CAMINHO_CONFIG = os.environ.get("PONTE_CONFIG") or os.path.join(RAIZ, "config.yaml")

app = Flask(__name__, static_folder=None)

# Duas pessoas podem ter o painel aberto ao mesmo tempo. Uma cue por vez evita
# que dois cliques simultaneos embaralhem cenas de OBS e luz.
_tranca_de_cue = threading.Lock()

_config = {}
_contexto = {}
_cues_por_id = {}
_ordens_por_id = {}


# -- carga -------------------------------------------------------------------


def _morrer(mensagem):
    print("\n" + "=" * 70)
    print("A ponte nao conseguiu subir:\n")
    print(mensagem)
    print("=" * 70 + "\n")
    input("Pressione Enter para fechar...")
    sys.exit(1)


def carregar_config():
    if not os.path.exists(CAMINHO_CONFIG):
        _morrer("Nao encontrei o config.yaml em:\n  {}".format(CAMINHO_CONFIG))
    try:
        with open(CAMINHO_CONFIG, "r", encoding="utf-8") as arquivo:
            return yaml.safe_load(arquivo) or {}
    except yaml.YAMLError as erro:
        _morrer(
            "O config.yaml tem um erro de formatacao. Costuma ser indentacao\n"
            "ou dois-pontos faltando. Detalhe:\n\n{}".format(erro)
        )
    except OSError as erro:
        _morrer("Nao consegui ler o config.yaml ({})".format(erro))


def montar_contexto(config):
    """Cria os clientes. Secao desligada ou mal configurada vira None.

    Cada sistema ganha DOIS clientes: um para as cues e outro, com tempo de
    espera curto, so para o status do painel.

    Nao e desperdicio, e o contrario. Com um cliente so, um teste de status
    pendurado segura a trava interna, e o operador que aperta um botao fica
    esperando o status terminar. Oito segundos de botao morto no meio de um
    culto. Separando, uma coisa nunca atrasa a outra.
    """
    contexto = {
        "obs": None, "obs_saude": None,
        "holyrics": None, "holyrics_saude": None,
        "luzes": None, "looks": {},
    }

    conf_obs = config.get("obs") or {}
    if conf_obs.get("ativo"):
        argumentos = (
            conf_obs.get("host", "127.0.0.1"),
            conf_obs.get("porta", 4455),
            conf_obs.get("senha", ""),
        )
        contexto["obs"] = ClienteOBS(*argumentos)
        # 3,5s e nao 2s de proposito. Uma conexao recusada leva ~2s pra voltar
        # no Windows; com timeout de 2s o teste de status corria com a recusa e
        # dizia "nao respondeu a tempo" enquanto a cue dizia "nao esta aberto".
        # Duas explicacoes pro mesmo problema, na mesma tela.
        contexto["obs_saude"] = ClienteOBS(*argumentos, timeout=3.5, tentativas=1)

    conf_holy = config.get("holyrics") or {}
    if conf_holy.get("ativo"):
        argumentos = (
            conf_holy.get("host", "127.0.0.1"),
            conf_holy.get("porta", 8091),
            conf_holy.get("token", ""),
        )
        contexto["holyrics"] = ClienteHolyrics(*argumentos)
        contexto["holyrics_saude"] = ClienteHolyrics(*argumentos, timeout=2.0)

    # O motor de movimento nasce antes do cliente de luz, porque o cliente
    # chama ele na hora de enviar cada quadro.
    try:
        contexto["movimento"] = mod_movimento.Movimento(
            config.get("grupos_de_luz") or {}, config.get("movimentos") or {}
        )
    except Exception as erro:
        print("[aviso] movimento desligado: {}".format(erro))
        contexto["movimento"] = None

    try:
        contexto["luzes"] = mod_luzes.montar(
            config.get("luzes") or {}, modulador=contexto.get("movimento")
        )
    except Exception as erro:
        # Config de luz ruim nao pode impedir o culto de usar OBS e Holyrics.
        print("[aviso] luzes desligadas: {}".format(erro))

    # O SEGUIDOR e a outra metade do modo agente, e so roda na maquina que
    # ALCANCA a luz. Ela vai buscar o quadro na ponte que conduz o culto e
    # aplica aqui. Ver ponte/seguidor.py para o porque do sentido invertido.
    conf_seg = config.get("seguidor") or {}
    contexto["seguidor"] = None
    if conf_seg.get("ativo") and contexto.get("luzes") is not None:
        try:
            contexto["seguidor"] = mod_seguidor.Seguidor(
                conf_seg["url"],
                contexto["luzes"],
                movimento=contexto.get("movimento"),
                intervalo=float(conf_seg.get("intervalo", 0.25)),
                saneamento=conf_seg.get("saneamento") or {},
            )
            contexto["seguidor"].comecar()
            print("[seguidor] buscando o quadro em {}".format(conf_seg["url"]))
        except Exception as erro:
            print("[aviso] seguidor desligado: {}".format(erro))
    elif conf_seg.get("ativo"):
        print("[aviso] seguidor pedido mas as luzes estao desligadas")

    # UM CLIENTE DE YOUTUBE POR CANAL. Nao e exagero: o Google amarra o
    # consentimento a um canal, entao canais diferentes sao autorizacoes
    # diferentes, com arquivos de token diferentes. Nas sextas a igreja
    # transmite noutro canal, e era isso que exigia o desenho assim.
    contexto["youtube"] = {}
    conf_yt = config.get("youtube") or {}
    if conf_yt.get("ativo"):
        credencial = os.path.join(RAIZ, conf_yt.get("credencial", "_google_oauth.json"))
        destino = conf_yt.get("redirect_uri", "http://localhost:8765/")
        for canal in conf_yt.get("canais") or []:
            if not isinstance(canal, dict) or not canal.get("id"):
                print("[aviso] um canal de youtube sem 'id' foi ignorado")
                continue
            contexto["youtube"][str(canal["id"])] = {
                "nome": canal.get("nome", canal["id"]),
                "cliente": mod_youtube.ClienteYouTube(
                    credencial,
                    os.path.join(RAIZ, canal.get("token",
                                                 "_youtube_token_{}.json".format(canal["id"]))),
                    redirect_uri=destino,
                ),
            }

    # As looks do config.yaml sao a base; as desenhadas na mesa de teste
    # entram por cima. Quem salvou uma look chamada "louvor" na mesa quis
    # dizer que a de agora e aquela, nao a que alguem escreveu em outubro.
    contexto["looks"] = dict(config.get("looks") or {})
    try:
        contexto["looks"].update(mod_mesa.carregar_looks())
    except mod_mesa.ErroMesa as erro:
        print("[aviso] looks salvas ignoradas: {}".format(erro))
    return contexto


def indexar_cues(config):
    indice = {}
    for cue in config.get("cues") or []:
        if not isinstance(cue, dict) or not cue.get("id"):
            print("[aviso] uma cue sem 'id' foi ignorada")
            continue
        indice[str(cue["id"])] = cue
    if not indice:
        print("[aviso] nenhuma cue valida no config.yaml — o painel vai abrir vazio")
    return indice


# -- rotas -------------------------------------------------------------------


@app.get("/")
def painel():
    return send_from_directory(RAIZ, "painel.html")


@app.get("/api/cues")
def listar_cues():
    return jsonify(
        [
            {
                "id": cue["id"],
                "nome": cue.get("nome", cue["id"]),
                "cor": cue.get("cor", "#334155"),
                "confirmar": bool(cue.get("confirmar")),
            }
            for cue in _cues_por_id.values()
        ]
    )


@app.post("/api/cue/<cue_id>")
def rodar_cue(cue_id):
    cue = _cues_por_id.get(cue_id)
    if cue is None:
        return jsonify({"erro": "cue '{}' nao existe".format(cue_id)}), 404

    # NAO bloqueia esperando a trava: recusa na hora com 409.
    #
    # Antes isso era `with _tranca_de_cue:`, que ENFILEIRA o clique em vez de
    # recusar. Com o OBS morto, uma cue de quatro passos leva ~30s segurando a
    # trava; nesse intervalo cada clique nao falha — espera e dispara depois.
    # O operador, vendo nada acontecer, clica de novo. E de novo. Meio minuto
    # depois tres cues disparam em sequencia e ninguem entende por que.
    #
    # Recusar na hora e honesto: o painel mostra "ja esta rodando" e a pessoa
    # sabe que o sistema a ouviu.
    if not _tranca_de_cue.acquire(blocking=False):
        return jsonify({
            "erro": "uma cue ja esta rodando",
            "ocupado": True,
        }), 409
    try:
        resultados = executar(cue, _contexto)
    finally:
        _tranca_de_cue.release()

    return jsonify(
        {
            "id": cue_id,
            "nome": cue.get("nome", cue_id),
            "passos": resultados,
            "tudo_ok": all(p["estado"] != "erro" for p in resultados),
        }
    )


# ---------------------------------------------------------------------------
#  ORDEM DE CULTO
#
#  Uma ordem e uma lista de ids de cue. O que a ponte guarda e onde o operador
#  esta nessa lista — e isso mora no SERVIDOR, nao no navegador. E o que faz
#  recarregar a pagina nao perder o lugar, e o que faz o celular e o PC verem
#  a mesma coisa.
# ---------------------------------------------------------------------------
_ordem = {"id": None, "nome": None, "momentos": [], "atual": None, "versao": 0}
_tranca_ordem = threading.Lock()
CAMINHO_PONTEIRO = os.path.join(RAIZ, "_ordem_atual.json")


def indexar_ordens(config):
    """Indexa as ordens, avisando sobre id de cue que nao existe."""
    indice = {}
    for ordem in config.get("ordens") or []:
        if not isinstance(ordem, dict) or not ordem.get("id"):
            print("[aviso] uma ordem sem 'id' foi ignorada")
            continue
        momentos = [str(m) for m in (ordem.get("momentos") or [])]
        faltando = [m for m in momentos if m not in _cues_por_id]
        if faltando:
            print("[aviso] ordem '{}' cita cue que nao existe: {}".format(
                ordem["id"], ", ".join(faltando)))
        indice[str(ordem["id"])] = {
            "id": str(ordem["id"]),
            "nome": ordem.get("nome", ordem["id"]),
            "momentos": [m for m in momentos if m in _cues_por_id],
        }
    return indice


def _salvar_ponteiro():
    """Grava onde o culto parou. Best-effort: falhar aqui nao pode atrapalhar.

    Existe porque, se a ponte morrer no meio do culto, o voluntario nao sabe
    recuperar o lugar sozinho.
    """
    try:
        with open(CAMINHO_PONTEIRO, "w", encoding="utf-8") as arquivo:
            json.dump({"ordem": _ordem["id"], "atual": _ordem["atual"]}, arquivo)
    except Exception:
        pass


def _carregar_ordem(ordem_id, atual=None):
    """Troca a ordem ativa. Chamar sob _tranca_ordem."""
    ordem = _ordens_por_id.get(ordem_id)
    if ordem is None:
        return False
    _ordem.update({
        "id": ordem["id"],
        "nome": ordem["nome"],
        "momentos": list(ordem["momentos"]),
        "atual": atual,
        "versao": _ordem["versao"] + 1,
    })
    return True


def _retrato_da_ordem():
    """Como a ordem aparece para quem pergunta. Chamar sob _tranca_ordem."""
    atual = _ordem["atual"]
    momentos = _ordem["momentos"]
    return {
        "id": _ordem["id"],
        "nome": _ordem["nome"],
        "versao": _ordem["versao"],
        "atual": atual,
        "atual_id": momentos[atual] if atual is not None and atual < len(momentos) else None,
        "proximo_id": momentos[atual + 1] if atual is not None and atual + 1 < len(momentos)
                      else (momentos[0] if atual is None and momentos else None),
        "momentos": [
            {
                "id": m,
                "nome": _cues_por_id.get(m, {}).get("nome", m),
                "cor": _cues_por_id.get(m, {}).get("cor", "#334155"),
                "confirmar": bool(_cues_por_id.get(m, {}).get("confirmar")),
            }
            for m in momentos
        ],
    }


def _transicionar(indice_alvo, versao_cliente=None):
    """Move o ponteiro e dispara o momento. Devolve (corpo, codigo_http).

    ORDEM DAS TRAVAS, e so se erra uma vez:
      1. _tranca_de_cue SEM bloquear  (recusa se ja ha cue rodando)
      2. sob _tranca_ordem: valida e GRAVA o ponteiro
      3. solta _tranca_ordem
      4. executa os passos
      5. solta _tranca_de_cue
    Nunca segurar _tranca_ordem atravessando executar(): um momento contra um
    OBS morto leva dezenas de segundos, e nesse intervalo ninguem conseguiria
    nem LER onde o culto esta.
    """
    if not _tranca_de_cue.acquire(blocking=False):
        with _tranca_ordem:
            return {"erro": "uma cue ja esta rodando", "ocupado": True,
                    "ordem": _retrato_da_ordem()}, 409
    try:
        with _tranca_ordem:
            momentos = _ordem["momentos"]
            if not momentos:
                return {"erro": "nenhuma ordem carregada"}, 409
            if versao_cliente is not None and versao_cliente != _ordem["versao"]:
                # Outro operador mexeu entre a leitura e o clique.
                return {"erro": "a ordem mudou enquanto voce decidia",
                        "conflito": True, "ordem": _retrato_da_ordem()}, 409
            if not 0 <= indice_alvo < len(momentos):
                return {"erro": "momento fora da ordem",
                        "ordem": _retrato_da_ordem()}, 400

            # O ponteiro e gravado ANTES de executar, de proposito: ele diz
            # onde o operador esta no culto, nao o que o hardware confirmou.
            _ordem["atual"] = indice_alvo
            _ordem["versao"] += 1
            momento_id = momentos[indice_alvo]
            retrato = _retrato_da_ordem()

        _salvar_ponteiro()
        cue = _cues_por_id.get(momento_id) or {}
        resultados = executar(cue, _contexto)
    finally:
        _tranca_de_cue.release()

    return {
        "id": momento_id,
        "nome": cue.get("nome", momento_id),
        "passos": resultados,
        "tudo_ok": all(p["estado"] != "erro" for p in resultados),
        "ordem": retrato,
    }, 200


@app.get("/api/ordens")
def listar_ordens():
    with _tranca_ordem:
        atual = _retrato_da_ordem()
    return jsonify({
        "carregada": atual,
        "disponiveis": [
            {"id": o["id"], "nome": o["nome"], "quantos": len(o["momentos"])}
            for o in _ordens_por_id.values()
        ],
    })


@app.post("/api/ordem/carregar/<ordem_id>")
def carregar_ordem_rota(ordem_id):
    with _tranca_ordem:
        if not _carregar_ordem(ordem_id):
            return jsonify({"erro": "ordem '{}' nao existe".format(ordem_id)}), 404
        retrato = _retrato_da_ordem()
    _salvar_ponteiro()
    return jsonify({"ordem": retrato})


@app.post("/api/ordem/ir/<momento_id>")
def ir_para_momento(momento_id):
    """Rota PRIMARIA. Alvo absoluto: clicar duas vezes leva ao mesmo lugar."""
    dados = request.get_json(silent=True) or {}
    with _tranca_ordem:
        try:
            indice = _ordem["momentos"].index(momento_id)
        except ValueError:
            return jsonify({"erro": "'{}' nao esta na ordem carregada".format(
                momento_id)}), 404
    corpo, codigo = _transicionar(indice, dados.get("versao"))
    return jsonify(corpo), codigo


@app.post("/api/ordem/proximo")
def proximo_momento():
    dados = request.get_json(silent=True) or {}
    with _tranca_ordem:
        atual = _ordem["atual"]
        alvo = 0 if atual is None else atual + 1
        if alvo >= len(_ordem["momentos"]):
            return jsonify({"erro": "a ordem ja terminou",
                            "ordem": _retrato_da_ordem()}), 409
    corpo, codigo = _transicionar(alvo, dados.get("versao"))
    return jsonify(corpo), codigo


@app.post("/api/ordem/anterior")
def momento_anterior():
    dados = request.get_json(silent=True) or {}
    with _tranca_ordem:
        atual = _ordem["atual"]
        if atual is None or atual == 0:
            return jsonify({"erro": "ja esta no comeco",
                            "ordem": _retrato_da_ordem()}), 409
        alvo = atual - 1
    corpo, codigo = _transicionar(alvo, dados.get("versao"))
    return jsonify(corpo), codigo


@app.get("/api/status")
def status():
    sistemas = []

    # Sempre pelos clientes de saude: o painel pergunta de 15 em 15 segundos,
    # e isso nunca pode atrasar um botao.
    if _contexto.get("obs_saude") is None:
        sistemas.append(_sistema("OBS", "desligado", "ativo: false no config.yaml"))
    else:
        try:
            versao = _contexto["obs_saude"].versao()
            sistemas.append(
                _sistema("OBS", "ok", "versao {}".format(versao.get("obsVersion", "?")))
            )
        except Exception as erro:
            sistemas.append(_sistema("OBS", "erro", str(erro)))

    conf_holy = _config.get("holyrics") or {}
    if _contexto.get("holyrics_saude") is None:
        sistemas.append(
            _sistema("Holyrics", "desligado", "ativo: false no config.yaml")
        )
    else:
        acao = conf_holy.get("acao_de_teste") or "GetCurrentPresentation"
        try:
            _contexto["holyrics_saude"].pedir(acao)
            sistemas.append(_sistema("Holyrics", "ok", "respondeu a {}".format(acao)))
        except Exception as erro:
            sistemas.append(_sistema("Holyrics", "erro", str(erro)))

    # Na maquina que SEGUE, o que importa saber nao e "o Art-Net esta
    # saindo?" — e "eu ainda estou ouvindo a ponte que conduz o culto?". Se
    # ela some, a luz fica congelada no ultimo quadro e ninguem percebe sem
    # isto aqui.
    seg = _contexto.get("seguidor")
    if seg is not None:
        r = seg.retrato()
        if r["ligado"]:
            sistemas.append(_sistema(
                "Seguidor", "ok",
                "ouvindo a ponte do culto — modo {}".format(r.get("modo") or "parado")))
        else:
            sistemas.append(_sistema(
                "Seguidor", "erro",
                "perdi a ponte do culto: {}".format(r.get("erro") or "sem resposta")))

    if _contexto.get("luzes") is None:
        sistemas.append(_sistema("Luzes", "desligado", "driver: nenhum"))
    else:
        # Art-Net nao tem resposta: so da pra dizer para onde esta mandando.
        sistemas.append(
            _sistema("Luzes", "enviando", _contexto["luzes"].descrever())
        )

    return jsonify(sistemas)


# Estado ao vivo: o que esta no ar AGORA, nos dois programas.
#
# Um painel que so dispara comando e nao mostra nada deixa quem opera no
# escuro: ele clica e torce. Com o estado na tela, a pessoa ve a consequencia
# do que fez, e percebe quando alguem mexeu por outro caminho.
#
# Fica num cache alimentado por uma thread de fundo, nunca lido sob demanda.
# Assim a tela responde na hora, e uma consulta lenta ao OBS nunca segura o
# navegador nem concorre com uma cue.
_estado = {"holyrics": None, "obs": None, "em": None}
_tranca_estado = threading.Lock()
PAUSA_ESTADO = 3.0


def _ler_estado_holyrics():
    cliente = _contexto.get("holyrics_saude")
    if cliente is None:
        return None
    try:
        atual = cliente.pedir("GetCurrentPresentation").get("data")
    except Exception:
        return None
    dados = {"preta": None}
    try:
        dados["preta"] = bool(cliente.pedir("GetF10").get("data"))
    except Exception:
        pass
    if not atual:
        dados["vazio"] = True
        return dados
    dados.update({
        "vazio": False,
        "tipo": atual.get("type"),
        "nome": atual.get("name") or "",
        "slide": atual.get("slide_number"),
        "total": atual.get("total_slides"),
    })
    return dados


def _ler_estado_obs():
    cliente = _contexto.get("obs_saude")
    if cliente is None:
        return None
    try:
        cenas = cliente.pedir("GetSceneList")
        gravacao = cliente.pedir("GetRecordStatus")
        transmissao = cliente.pedir("GetStreamStatus")
    except Exception:
        return None
    return {
        "no_ar": cenas.get("currentProgramSceneName"),
        "preview": cenas.get("currentPreviewSceneName"),
        "gravando": bool(gravacao.get("outputActive")),
        "transmitindo": bool(transmissao.get("outputActive")),
    }


def _atualizar_estado():
    """Roda sozinha, de fundo, enquanto a ponte estiver no ar."""
    while True:
        try:
            novo = {
                "holyrics": _ler_estado_holyrics(),
                "obs": _ler_estado_obs(),
                "em": time.strftime("%H:%M:%S"),
            }
            with _tranca_estado:
                _estado.update(novo)
        except Exception:
            # Esta thread nao pode morrer: se ela cair, o painel congela
            # mostrando um estado velho como se fosse atual, que e pior que
            # nao mostrar nada.
            pass
        time.sleep(PAUSA_ESTADO)


@app.get("/api/estado")
def estado():
    # A ordem entra AQUI, e nao numa rota propria: o painel ja consulta este
    # endereco a cada 3 segundos, e "em que momento o culto esta" e a mesma
    # preocupacao que ele ja serve. Um quarto poller seria desperdicio.
    with _tranca_estado:
        corpo = dict(_estado)
    with _tranca_ordem:
        corpo["ordem"] = _retrato_da_ordem()
    return jsonify(corpo)


@app.get("/api/cenas-obs")
def cenas_obs():
    """Lista as cenas do OBS — util pra preencher o config.yaml sem errar nome."""
    if _contexto.get("obs") is None:
        return jsonify({"erro": "OBS desligado no config.yaml"}), 400
    try:
        return jsonify({"cenas": _contexto["obs"].cenas()})
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502


# -- mesa de teste de luz ----------------------------------------------------
#
# Serve pra DESENHAR look, que e uma coisa diferente de rodar cue. Desenhar e
# mexer e olhar: arrasta o fader, a luz responde, decide. Por isso estas rotas
# mandam Art-Net na hora, sem passar pelo motor de cues e sem a trava de cue —
# ela existe pra impedir duas cues ao mesmo tempo, e aqui nao ha cue nenhuma.
#
# Se uma cue rodar enquanto alguem mexe na mesa, as duas escrevem no mesmo
# quadro DMX e a ultima vence. E o comportamento certo, e e o mesmo de uma
# mesa de luz fisica — mas e bom saber antes de achar que a mesa "perdeu" o
# valor.


@app.get("/louvor")
def pagina_louvor():
    """O nivel 2: durante o louvor, quem conduz e a musica.

    POR ENQUANTO E SIMULACAO, e a pagina diz isso em letras grandes. Falta
    uma peca so para virar real: algo que diga onde a musica esta AGORA.
    Hoje o playback roda num iPad, que nao conta isso para ninguem.
    """
    return send_from_directory(RAIZ, "louvor.html")


@app.get("/api/louvores")
def listar_louvores():
    return jsonify({"louvores": _config.get("louvores") or []})


# As secoes de uma musica NAO precisam ser inventadas: a banda ja as escreve.
# Descoberto em 08/11 lendo os slides do acervo — eles vem com marcadores no
# proprio texto, em linhas que comecam com "//":
#
#   //Solo: masculino      //Todos: unissono      //instrumental...
#   //cai a cancao...      //sobe a voz...        //marcacao mais alta
#
# Sao anotacoes de quem canta, para quem canta. Usar isso em vez de uma
# divisao minha tem tres vantagens, e a terceira e a que importa: os nomes
# sao os que a banda USA, a divisao ja esta certa, e ninguem precisa manter
# uma segunda lista em lugar nenhum. Quando a banda muda o arranjo, a
# estrutura muda junto, sozinha.
MARCADOR = "//"


def _secoes_dos_slides(slides):
    """Agrupa os slides em secoes, usando os marcadores // como fronteira.

    Um slide que comeca com marcador abre secao nova; os seguintes, sem
    marcador, continuam nela. Slides antes do primeiro marcador viram uma
    secao "Inicio", para nenhuma letra ficar orfa.
    """
    secoes = []
    for indice, slide in enumerate(slides):
        texto = (slide.get("text") or "").strip()
        primeira = texto.split("\n", 1)[0].strip()
        if primeira.startswith(MARCADOR):
            nome = primeira[len(MARCADOR):].strip().rstrip(".").strip()
            secoes.append({"nome": nome or "parte", "slide": indice, "slides": 1})
        elif secoes:
            secoes[-1]["slides"] += 1
        else:
            secoes.append({"nome": "Início", "slide": indice, "slides": 1})
    return secoes


@app.get("/api/louvor/musica/<identificador>")
def louvor_musica(identificador):
    """A estrutura REAL de uma musica, lida do Holyrics."""
    cliente = _contexto.get("holyrics")
    if cliente is None:
        return jsonify({"erro": "Holyrics desligado no config.yaml"}), 400
    try:
        corpo = cliente.pedir("GetSong", {"id": str(identificador)})
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502

    # O cliente devolve o ENVELOPE do Holyrics ({"status": ..., "data": ...}),
    # nao o conteudo. Procurar "slides" na raiz devolvia vazio, e o 404 que
    # saia daqui parecia "musica sem slides" quando na verdade era eu olhando
    # no lugar errado. Aceita os dois formatos, para o dia em que o cliente
    # passar a desembrulhar.
    dados = corpo.get("data") if isinstance(corpo, dict) and "data" in corpo else corpo
    dados = dados or {}

    slides = dados.get("slides") or []
    if not slides:
        return jsonify({"erro": "essa musica nao tem slides no Holyrics"}), 404

    return jsonify({
        "id": str(identificador),
        "titulo": dados.get("title"),
        "bpm": dados.get("bpm"),
        "total_slides": len(slides),
        "secoes": _secoes_dos_slides(slides),
    })


@app.post("/api/louvor/mostrar/<identificador>")
def louvor_mostrar(identificador):
    """Poe a musica no telao."""
    cliente = _contexto.get("holyrics")
    if cliente is None:
        return jsonify({"erro": "Holyrics desligado no config.yaml"}), 400
    try:
        cliente.pedir("ShowLyrics", {"id": str(identificador)})
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502
    return jsonify({"mostrando": str(identificador)})


@app.post("/api/louvor/slide/<int:indice>")
def louvor_slide(indice):
    """Salta para um slide da apresentacao que esta no ar."""
    cliente = _contexto.get("holyrics")
    if cliente is None:
        return jsonify({"erro": "Holyrics desligado no config.yaml"}), 400
    try:
        cliente.pedir("ActionGoToIndex", {"index": int(indice)})
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502
    return jsonify({"slide": int(indice)})


# -- o relogio da musica -----------------------------------------------------
#
# ISTO SUBSTITUI UM MODELO ERRADO, e vale ficar escrito porque a tentacao de
# voltar ao errado e grande: a primeira versao calculava a linha do tempo a
# partir do BPM, multiplicando compassos por segundos-por-compasso. Parece
# certo e e falso, porque gravacao moderna de louvor VARIA DE ANDAMENTO — o
# proprio MultiTracks avisa isso nas musicas que olhamos em 09/11 e recomenda
# usar o click que vem no pacote.
#
# Entao o relogio nao e um cronometro nosso: e o AUDIO. Quem manda no tempo e
# o `currentTime` do arquivo que esta tocando, e cada secao guarda o SEGUNDO
# em que entra naquela gravacao. Isso funciona com musica que varia e com
# musica que nao varia, e e o unico modelo que sobrevive ao VS de verdade
# chegar — troca-se o arquivo, remarcam-se os segundos, nada de codigo muda.

EXTENSOES_DE_AUDIO = {".wav", ".mp3", ".ogg", ".m4a", ".flac"}
CAMINHO_MARCAS = os.path.join(RAIZ, "_marcas_louvor.json")


@app.get("/api/louvor/audio/<nome>")
def louvor_audio(nome):
    """Entrega o arquivo de audio da musica para o <audio> da pagina.

    `send_from_directory` ja barra caminho pra fora da pasta, mas a checagem
    de extensao esta aqui de proposito: sem ela esta rota serviria o
    config.yaml — que tem o token do Holyrics e a senha do OBS — a quem
    pedisse /api/louvor/audio/config.yaml. A pagina nao tem senha.
    """
    if os.path.splitext(nome)[1].lower() not in EXTENSOES_DE_AUDIO:
        return jsonify({"erro": "isso nao e arquivo de audio"}), 400
    if not os.path.exists(os.path.join(RAIZ, nome)):
        return jsonify({"erro": "nao achei {}".format(nome)}), 404
    # conditional=True da suporte a Range, que e o que deixa o navegador
    # buscar no meio do arquivo sem baixar os 20 MB inteiros antes.
    return send_from_directory(RAIZ, nome, conditional=True)


def _ler_marcas():
    """Le o arquivo de marcas, tolerando BOM e NUNCA falhando calado.

    "utf-8-sig" e de proposito, e custou uma hora: o PowerShell 5.1 escreve
    UTF-8 COM BOM por padrao, e `json.load` com "utf-8" rejeita o BOM. Como
    aqui ha um except largo — que precisa existir, porque arquivo de marcas
    corrompido nao pode derrubar a ponte no meio do culto — o resultado era
    a ponte devolver "nenhuma marca" com as marcas intactas no disco. Perda
    de dado silenciosa, que e a pior especie.

    "utf-8-sig" aceita os dois: com BOM e sem. E o aviso impresso e o que
    transforma "sumiu" em "da para procurar".
    """
    if not os.path.exists(CAMINHO_MARCAS):
        return {}
    try:
        with open(CAMINHO_MARCAS, "r", encoding="utf-8-sig") as arquivo:
            dados = json.load(arquivo)
        return dados if isinstance(dados, dict) else {}
    except Exception as erro:
        print("  AVISO: nao consegui ler {}: {}".format(CAMINHO_MARCAS, erro))
        return {}


@app.get("/api/louvor/marcas/<identificador>")
def louvor_marcas_ler(identificador):
    return jsonify({"marcas": _ler_marcas().get(str(identificador)) or []})


@app.post("/api/louvor/marcas/<identificador>")
def louvor_marcas_gravar(identificador):
    """Grava os segundos marcados ao vivo, ouvindo a gravacao.

    Chega uma lista [{nome, segundo, cena, modo, slide}]. O servidor ORDENA
    por segundo antes de gravar: quem marca ao vivo erra e remarca, e uma
    lista fora de ordem quebraria a busca da secao atual na pagina.
    """
    corpo = request.get_json(silent=True) or {}
    cruas = corpo.get("marcas")
    if not isinstance(cruas, list):
        return jsonify({"erro": "manda marcas: [...]"}), 400

    limpas = []
    for marca in cruas:
        if not isinstance(marca, dict):
            continue
        try:
            segundo = float(marca.get("segundo"))
        except (TypeError, ValueError):
            continue
        if segundo < 0:
            continue
        item = {"nome": str(marca.get("nome") or "parte"),
                "segundo": round(segundo, 3)}
        for chave in ("cena", "modo"):
            if marca.get(chave):
                item[chave] = str(marca[chave])
        if marca.get("slide") is not None:
            try:
                item["slide"] = int(marca["slide"])
            except (TypeError, ValueError):
                pass
        limpas.append(item)
    limpas.sort(key=lambda m: m["segundo"])

    todas = _ler_marcas()
    todas[str(identificador)] = limpas
    try:
        with open(CAMINHO_MARCAS, "w", encoding="utf-8") as arquivo:
            json.dump(todas, arquivo, ensure_ascii=False, indent=2)
    except OSError as erro:
        return jsonify({"erro": "nao consegui gravar: {}".format(erro)}), 500
    return jsonify({"marcas": limpas})


@app.get("/luzes")
def pagina_luzes():
    return send_from_directory(RAIZ, "luzes.html")


@app.get("/cenas")
def pagina_cenas():
    """O painel do dia a dia: cor e intensidade por GRUPO de refletor.

    /luzes e canal por canal, para quem esta descobrindo o patch. Aqui e para
    quem esta montando o culto e nao precisa saber que o canal 53 e o vermelho
    do C1. Usa so as rotas /api/luz/* que ja existem.
    """
    return send_from_directory(RAIZ, "cenas.html")


def _cliente_de_luz():
    cliente = _contexto.get("luzes")
    if cliente is None:
        return None, (jsonify({
            "erro": "as luzes estao em driver: nenhum no config.yaml",
            "dica": "troque para driver: artnet e ponha o host da interface",
        }), 400)
    return cliente, None


@app.post("/api/luz/canais")
def luz_canais():
    """Acende canais AGORA. Com exclusivo=true, apaga todo o resto antes.

    O exclusivo e o que faz a varredura funcionar: acender o canal 7 sozinho
    so diz alguma coisa se os outros 511 estiverem em zero.
    """
    cliente, falha = _cliente_de_luz()
    if falha:
        return falha

    corpo = request.get_json(silent=True) or {}
    pedidos = corpo.get("canais") or {}
    if not isinstance(pedidos, dict):
        return jsonify({"erro": "canais precisa ser um objeto {canal: valor}"}), 400

    canais = {}
    if corpo.get("exclusivo"):
        canais = {numero: 0 for numero in range(1, 513)}
    try:
        for canal, valor in pedidos.items():
            canais[int(canal)] = int(valor)
    except (TypeError, ValueError):
        return jsonify({"erro": "canal ou valor nao numerico"}), 400

    try:
        cliente.aplicar(canais)
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 400

    # Art-Net e UDP: o pacote saiu, ninguem confirma. Dizer "enviado" e nao
    # "aceso" e proposital — quem confere luz e o olho.
    return jsonify({"enviado": True, "canais_tocados": len(pedidos)})


@app.post("/api/luz/apagar")
def luz_apagar():
    cliente, falha = _cliente_de_luz()
    if falha:
        return falha
    try:
        cliente.aplicar({numero: 0 for numero in range(1, 513)})
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify({"enviado": True})


@app.get("/api/luz/mesa")
def luz_mesa():
    """Tudo que a mesa precisa pra desenhar a tela."""
    try:
        salvas = mod_mesa.carregar_looks()
        patch = mod_mesa.carregar_patch()
    except mod_mesa.ErroMesa as erro:
        return jsonify({"erro": str(erro)}), 500

    motor = _contexto.get("movimento")
    do_config = {nome: canais for nome, canais in (_config.get("looks") or {}).items()}
    return jsonify({
        "ligado": _contexto.get("luzes") is not None,
        "driver": (_config.get("luzes") or {}).get("driver", "nenhum"),
        "descricao": _contexto["luzes"].descrever() if _contexto.get("luzes") else None,
        "modos": motor.catalogo() if motor else [],
        "modo_atual": (motor.atual() if motor else None) or "parado",
        "patch": {str(c): t for c, t in patch.items()},
        "looks_salvas": {n: {str(c): v for c, v in ch.items()} for n, ch in salvas.items()},
        "looks_config": {n: {str(c): v for c, v in (ch or {}).items()} for n, ch in do_config.items()},
    })


@app.post("/api/luz/cena/<nome>")
def luz_cena(nome):
    """Aplica uma cena pelo NOME, em vez de mandar os canais um a um.

    Existe porque quem chama de fora — a tela de louvor, por exemplo — sabe
    o nome da cena que o momento pede, nao os 75 canais dela. Guardar os
    canais em quem chama seria duplicar o patch em dois lugares, e um deles
    iria envelhecer.

    SEMPRE exclusivo: cena e estado absoluto, nao ajuste sobre a anterior.
    """
    cliente, falha = _cliente_de_luz()
    if falha:
        return falha

    look = (_contexto.get("looks") or {}).get(str(nome))
    if look is None:
        return jsonify({"erro": "nao existe a cena {!r}".format(nome)}), 404

    canais = {numero: 0 for numero in range(1, 513)}
    try:
        for canal, valor in look.items():
            canais[int(canal)] = int(valor)
        cliente.aplicar(canais)
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 400

    return jsonify({"cena": str(nome), "canais": len(look)})


@app.get("/api/luz/quadro")
def luz_quadro():
    """O que DEVERIA estar no ar. Quem busca isto e o PC do som.

    Esta maquina nao alcanca a interface de luz — ela esta atras de um
    roteador com NAT. Como NAT so deixa passar conexao de saida, quem pergunta
    e o outro lado, e nao o contrario.

    Vai o quadro PARADO e o NOME do modo. O movimento e calculado la, a 30
    quadros por segundo, localmente: mandar 30 quadros por segundo pela rede
    seria desperdicio e ainda ficaria tremido. Com `versao`, quem busca so age
    quando o numero muda — perguntar quatro vezes por segundo fica barato.
    """
    cliente = _contexto.get("luzes")
    if cliente is None or not hasattr(cliente, "retrato"):
        return jsonify({
            "erro": "esta ponte nao esta no modo agente",
            "dica": "ponha luzes.driver: agente no config.yaml",
        }), 400

    # Anota QUEM buscou e QUANDO. E a unica prova que esta maquina tem de que
    # a luz esta sendo levada ate os refletores: Art-Net nao responde, e a
    # interface fica atras de um roteador que daqui nao se enxerga. Em 12/11 o
    # PC do som caiu no meio do culto e o painel continuou dizendo "enviando"
    # — porque dizia o que mandava, nao o que alguem buscava.
    # Pedido deste proprio PC nao conta: e o navegador ou um teste.
    quem = request.remote_addr or ""
    if quem not in ("127.0.0.1", "::1"):
        _luz_vista["em"] = time.time()
        _luz_vista["de"] = quem

    motor = _contexto.get("movimento")
    corpo = cliente.retrato()
    corpo["modo"] = (motor.atual() if motor else None) or "parado"
    return jsonify(corpo)


@app.post("/api/luz/modo/<nome>")
def luz_modo(nome):
    """Liga um modo de movimento. 'parado' desliga.

    NAO EXISTE PASSO DE CUE QUE FACA ISTO, e e de proposito: o modo e escolha
    de quem esta operando, no momento. Uma cue que ligasse movimento sozinha
    poderia pos o estrobo no ar sem ninguem decidir.
    """
    motor = _contexto.get("movimento")
    if motor is None:
        return jsonify({"erro": "o motor de movimento nao carregou"}), 400
    try:
        escolhido = motor.escolher(None if nome == "parado" else nome)
    except mod_movimento.ErroMovimento as erro:
        return jsonify({"erro": str(erro)}), 404

    # Com o modo desligado, o proximo envio ja leva a cena pura — mas ele so
    # sai no proximo batimento, que pode demorar 1 segundo. Um envio imediato
    # faz o "Parado" responder na hora, que e o que se espera de um botao
    # que existe para abortar.
    cliente = _contexto.get("luzes")
    if cliente is not None:
        try:
            cliente.reenviar()
        except Exception:
            pass

    return jsonify({"modo": escolhido or "parado"})


@app.post("/api/luz/patch")
def luz_patch():
    corpo = request.get_json(silent=True) or {}
    try:
        texto = mod_mesa.salvar_rotulo(corpo.get("canal"), corpo.get("rotulo"))
    except mod_mesa.ErroMesa as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify({"salvo": True, "rotulo": texto})


@app.post("/api/luz/look")
def luz_salvar_look():
    corpo = request.get_json(silent=True) or {}
    try:
        canais = mod_mesa.salvar_look(corpo.get("nome"), corpo.get("canais"))
    except mod_mesa.ErroMesa as erro:
        return jsonify({"erro": str(erro)}), 400

    # Recarrega as looks em memoria na hora: salvar e nao poder usar antes de
    # reiniciar seria inutil justamente na reuniao em que se desenha look.
    _contexto["looks"] = dict(_config.get("looks") or {})
    try:
        _contexto["looks"].update(mod_mesa.carregar_looks())
    except mod_mesa.ErroMesa:
        pass

    return jsonify({"salvo": True, "nome": str(corpo.get("nome")).strip(),
                    "canais": {str(c): v for c, v in canais.items()}})


@app.post("/api/luz/look/<nome>/remover")
def luz_remover_look(nome):
    try:
        mod_mesa.remover_look(nome)
    except mod_mesa.ErroMesa as erro:
        return jsonify({"erro": str(erro)}), 400
    _contexto["looks"] = dict(_config.get("looks") or {})
    try:
        _contexto["looks"].update(mod_mesa.carregar_looks())
    except mod_mesa.ErroMesa:
        pass
    return jsonify({"removido": True})


# -- YouTube -----------------------------------------------------------------
#
# O OBS comeca e para a transmissao. O que ele NAO alcanca e o que pertence
# ao YouTube: titulo, visibilidade, miniatura — e para onde a transmissao vai.
#
# CADA CANAL TEM SUA PROPRIA AUTORIZACAO, porque o Google amarra o
# consentimento a um canal. Por isso um cliente por canal, e nao um so.
#
# A CHAVE DE TRANSMISSAO NUNCA CHEGA AO NAVEGADOR. O painel escolhe uma chave
# PELO ID; quem busca o valor e grava no OBS e o servidor. Chave na tela e
# chave num print de tela, numa foto, num grupo de WhatsApp.


def _canal_yt(cid):
    canal = (_contexto.get("youtube") or {}).get(str(cid))
    if canal is None:
        return None, (jsonify({"erro": "nao existe canal {!r} no config".format(cid)}), 404)
    return canal, None


def _retrato_canal(cid, canal):
    """O que o painel precisa de um canal. Tolera o canal fora do ar."""
    corpo = {"id": cid, "nome": canal["nome"], "autorizado": False}
    cliente = canal["cliente"]
    if not cliente.autorizado():
        return corpo
    corpo["autorizado"] = True
    try:
        real = cliente.canal()
        corpo["canal_real"] = real
        # Confere o que foi autorizado contra o que o config diz esperar. Ja
        # aconteceu de autorizar o canal errado duas vezes seguidas; com isto
        # na tela, o erro aparece na hora em vez de no domingo.
        if real and canal.get("nome") and real.get("nome") != canal["nome"]:
            corpo["aviso"] = ("o config chama este canal de {!r}, mas quem "
                              "autorizou foi {!r}".format(canal["nome"], real.get("nome")))
    except Exception as erro:
        corpo["erro"] = str(erro)
        return corpo

    for estado in ("active", "upcoming"):
        try:
            t = cliente.transmissao(estado)
        except Exception:
            t = None
        if t:
            corpo["transmissao"] = {
                "estado": estado,
                "id": t["id"],
                "titulo": (t.get("snippet") or {}).get("title"),
                "descricao": (t.get("snippet") or {}).get("description") or "",
                "privacidade": (t.get("status") or {}).get("privacyStatus"),
                "link": cliente.link(t),
                "chave_presa": (t.get("contentDetails") or {}).get("boundStreamId"),
            }
            break
    return corpo


@app.get("/youtube")
def pagina_youtube():
    return send_from_directory(RAIZ, "youtube.html")


@app.get("/api/youtube")
def youtube_estado():
    canais = _contexto.get("youtube") or {}
    if not canais:
        return jsonify({"erro": "o bloco youtube do config.yaml esta desligado "
                                "ou sem canais"}), 400
    return jsonify({"canais": [_retrato_canal(cid, c) for cid, c in canais.items()]})


@app.get("/api/youtube/<cid>/autorizacao")
def youtube_url_autorizacao(cid):
    """A URL para autorizar este canal. Quem abre e a pessoa, no navegador."""
    canal, falha = _canal_yt(cid)
    if falha:
        return falha
    try:
        return jsonify({"url": canal["cliente"].url_de_autorizacao(
            conta=request.args.get("conta") or None)})
    except mod_youtube.ErroYouTube as erro:
        return jsonify({"erro": str(erro)}), 400


@app.post("/api/youtube/<cid>/codigo")
def youtube_trocar_codigo(cid):
    """Troca por token um codigo obtido noutra maquina.

    O retorno da autorizacao vai para localhost, e localhost e sempre a
    maquina de quem abriu o navegador. Autorizando do celular ou de outro
    PC, o codigo precisa voltar por aqui.
    """
    canal, falha = _canal_yt(cid)
    if falha:
        return falha
    corpo = request.get_json(silent=True) or {}
    try:
        canal["cliente"].trocar_codigo(corpo.get("codigo") or "")
    except mod_youtube.ErroYouTube as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify(_retrato_canal(cid, canal))


@app.post("/api/youtube/<cid>/transmissao")
def youtube_atualizar(cid):
    """Muda titulo e/ou visibilidade da transmissao atual."""
    canal, falha = _canal_yt(cid)
    if falha:
        return falha
    corpo = request.get_json(silent=True) or {}
    cliente = canal["cliente"]
    try:
        atual = cliente.transmissao("active") or cliente.transmissao("upcoming")
        if not atual:
            return jsonify({"erro": "nao ha transmissao ativa nem agendada neste "
                                    "canal — crie uma no YouTube primeiro"}), 404
        cliente.atualizar(atual,
                          titulo=corpo.get("titulo"),
                          descricao=corpo.get("descricao"),
                          privacidade=corpo.get("privacidade"))
    except mod_youtube.ErroYouTube as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify(_retrato_canal(cid, canal))


@app.get("/api/youtube/<cid>/chaves")
def youtube_chaves(cid):
    """As chaves do canal, SEM VALOR, e qual delas o OBS esta usando."""
    canal, falha = _canal_yt(cid)
    if falha:
        return falha
    cliente = canal["cliente"]
    try:
        chaves = cliente.chaves()
    except mod_youtube.ErroYouTube as erro:
        return jsonify({"erro": str(erro)}), 400

    # Compara sem revelar: so diz qual BATE com a que esta no OBS.
    em_uso = None
    obs = _contexto.get("obs")
    if obs is not None:
        try:
            atual = (obs.pedir("GetStreamServiceSettings")
                     .get("streamServiceSettings") or {}).get("key")
            for k in chaves:
                if atual and cliente.chave_de(k["id"])["chave"] == atual:
                    em_uso = k["id"]
                    break
        except Exception:
            pass
    return jsonify({"chaves": chaves, "no_obs": em_uso})


@app.post("/api/youtube/<cid>/chave/<id_chave>")
def youtube_aplicar_chave(cid, id_chave):
    """Grava no OBS a chave escolhida. O valor nao passa pelo navegador.

    NAO EXISTE PASSO DE CUE QUE FACA ISTO, de proposito: trocar o destino da
    transmissao no meio de um culto por acidente e o tipo de erro que a
    equipe so descobre quando alguem avisa que o video saiu no canal errado.
    """
    canal, falha = _canal_yt(cid)
    if falha:
        return falha
    obs = _contexto.get("obs")
    if obs is None:
        return jsonify({"erro": "OBS desligado no config.yaml"}), 400

    try:
        dados = canal["cliente"].chave_de(id_chave)
    except mod_youtube.ErroYouTube as erro:
        return jsonify({"erro": str(erro)}), 400

    try:
        atual = obs.pedir("GetStreamServiceSettings")
        cfg_atual = dict(atual.get("streamServiceSettings") or {})
        # Guarda o que estava la antes de sobrescrever. Se a chave anterior
        # for de outro canal, ela pode nao estar a mao na hora de voltar.
        guarda = os.path.join(RAIZ, "_obs_stream_anterior.json")
        if not os.path.exists(guarda):
            with open(guarda, "w", encoding="utf-8") as arquivo:
                json.dump({"streamServiceType": atual.get("streamServiceType"),
                           "streamServiceSettings": cfg_atual}, arquivo)
        novo = dict(cfg_atual)
        novo["key"] = dados["chave"]
        if dados.get("servidor"):
            novo["server"] = dados["servidor"]
        obs.pedir("SetStreamServiceSettings", {
            "streamServiceType": atual.get("streamServiceType") or "rtmp_common",
            "streamServiceSettings": novo,
        })
    except Exception as erro:
        return jsonify({"erro": "nao consegui gravar no OBS: {}".format(erro)}), 502

    return jsonify({"aplicado": True, "canal": canal["nome"]})


def _sistema(nome, estado, detalhe):
    return {"nome": nome, "estado": estado, "detalhe": detalhe}


# ---------------------------------------------------------------------------
#  CHEGADA — o guia de quem chega para o culto
#
#  O conteudo e a logica moram em chegada.yaml e ponte/chegada.py. Aqui fica
#  so a cola: as rotas, e as funcoes que o guia precisa desta casa (rodar uma
#  cue respeitando a trava, trocar a ordem, refazer os clientes do OBS quando
#  o notebook muda de endereco).
# ---------------------------------------------------------------------------
_chegada = None
_luz_vista = {"em": None, "de": None}
_obs_host = {"valor": None}


def _args_obs(host=None):
    conf = _config.get("obs") or {}
    return (host or _obs_host["valor"] or conf.get("host", "127.0.0.1"),
            conf.get("porta", 4455), conf.get("senha", ""))


def _trocar_host_obs(host):
    """Refaz os clientes do OBS apontando para outro endereco.

    So em memoria, de proposito: escrever o config.yaml por codigo apagaria os
    comentarios dele. No proximo reinicio a ponte parte do endereco do config
    e, se ele estiver velho, reacha de novo pelo MAC em alguns segundos.
    """
    if not (_config.get("obs") or {}).get("ativo"):
        return
    _obs_host["valor"] = host
    argumentos = _args_obs()
    _contexto["obs"] = ClienteOBS(*argumentos)
    _contexto["obs_saude"] = ClienteOBS(*argumentos, timeout=3.5, tentativas=1)


def _cue_interna(cue_id):
    """Roda uma cue a pedido do guia, com a MESMA trava dos botoes do painel."""
    cue = _cues_por_id.get(cue_id)
    if cue is None:
        return False, "a cue '{}' nao existe no config.yaml".format(cue_id)
    if not _tranca_de_cue.acquire(blocking=False):
        return False, "outra cue esta rodando — tente de novo em instantes"
    try:
        resultados = executar(cue, _contexto)
    finally:
        _tranca_de_cue.release()
    ruins = [p for p in resultados if p.get("estado") == "erro"]
    if ruins:
        return False, "; ".join(str(p.get("detalhe") or p.get("erro") or p) for p in ruins)
    return True, "{}: feito".format(cue.get("nome", cue_id))


def _ordem_interna(ordem_id):
    with _tranca_ordem:
        if not _carregar_ordem(ordem_id):
            return False, "a ordem '{}' nao existe".format(ordem_id)
        nome = _ordem["nome"]
    _salvar_ponteiro()
    return True, "ordem de hoje: {}".format(nome)


def _ordens_para_o_guia():
    with _tranca_ordem:
        carregada = _retrato_da_ordem()
    return {"carregada": carregada,
            "disponiveis": [{"id": o["id"], "nome": o["nome"]}
                            for o in _ordens_por_id.values()]}


def _estado_para_o_guia():
    with _tranca_estado:
        return dict(_estado)


def _montar_chegada():
    def novo_obs():
        if not (_config.get("obs") or {}).get("ativo"):
            return None
        return ClienteOBS(*_args_obs(), timeout=3.5, tentativas=1)

    def novo_holyrics():
        conf = _config.get("holyrics") or {}
        if not conf.get("ativo"):
            return None
        return ClienteHolyrics(conf.get("host", "127.0.0.1"), conf.get("porta", 8091),
                               conf.get("token", ""), timeout=3.0)

    return mod_chegada.Chegada(RAIZ, {
        "contexto": lambda: _contexto,
        "estado": _estado_para_o_guia,
        "luz_vista": lambda: (_luz_vista["em"], _luz_vista["de"]),
        "rodar_cue": _cue_interna,
        "carregar_ordem": _ordem_interna,
        "ordens": _ordens_para_o_guia,
        "trocar_host_obs": _trocar_host_obs,
        "host_obs": lambda: _args_obs()[0],
        "novo_obs": novo_obs,
        "novo_holyrics": novo_holyrics,
    })


@app.get("/chegada")
def pagina_chegada():
    return send_from_directory(RAIZ, "chegada.html")


@app.get("/api/chegada")
def chegada_retrato():
    return jsonify(_chegada.retrato())


@app.post("/api/chegada/feito/<passo_id>")
def chegada_marcar(passo_id):
    corpo = request.get_json(silent=True) or {}
    try:
        _chegada.marcar(passo_id, feito=bool(corpo.get("feito", True)),
                        forcado=bool(corpo.get("forcado")))
    except mod_chegada.ErroChegada as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify(_chegada.retrato())


@app.post("/api/chegada/acao/<passo_id>")
def chegada_agir(passo_id):
    try:
        resultado = _chegada.agir(passo_id, request.get_json(silent=True) or {})
    except mod_chegada.ErroChegada as erro:
        return jsonify({"ok": False, "texto": str(erro)}), 400
    resultado["chegada"] = _chegada.retrato()
    return jsonify(resultado)


@app.post("/api/chegada/recomecar")
def chegada_recomecar():
    _chegada.recomecar()
    return jsonify(_chegada.retrato())


@app.get("/api/chegada/imagem")
def chegada_imagem():
    try:
        dados, tipo = _chegada.imagem_do_obs()
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502
    resposta = Response(dados, mimetype=tipo)
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


@app.post("/api/chegada/culto")
def chegada_culto():
    corpo = request.get_json(silent=True) or {}
    try:
        _chegada.definir_culto(corpo.get("ordem"), corpo.get("hora"), corpo.get("presentes"))
    except mod_chegada.ErroChegada as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify(_chegada.retrato())


# ---------------------------------------------------------------------------
#  A MAQUINA E O SEU PAPEL
#
#  O projeto e UM SO, instalado igual em todo PC. O que muda de uma maquina
#  para outra e o PAPEL, escrito num arquivo pequeno ao lado (maquina.yaml):
#
#      papel: holyrics | transmissao | som
#      principal: http://192.168.1.143:8700     (so nas que nao sao a principal)
#
#  O papel decide duas coisas: QUAL PAGINA abre quando o PC liga (/aqui), e
#  QUEM RESPONDE as perguntas do guia. A maquina "holyrics" e a principal:
#  mede, guarda o progresso e executa. As outras sao janelas para ela — a
#  pagina e servida daqui, mas o estado vem de la, e uma marca feita aqui e
#  entregue la. Assim o celular, o notebook e o PC do som veem a mesma coisa.
#
#  Por que o projeto inteiro em toda maquina, e nao um "cliente leve" nas
#  secundarias: e o que deixa qualquer uma ASSUMIR o papel de principal no dia
#  em que a principal morrer — troca-se uma linha do maquina.yaml. Isso ainda
#  e manual; a troca automatica nao existe.
#
#  PONTE_PAPEL e PONTE_PRINCIPAL, no ambiente, passam por cima do arquivo:
#  servem para subir os tres papeis numa maquina so e testar a conversa.
# ---------------------------------------------------------------------------
CAMINHO_MAQUINA = os.path.join(RAIZ, "maquina.yaml")
PAPEIS = {
    "holyrics": "PC do Holyrics",
    "transmissao": "Notebook da transmissão",
    "som": "PC do som",
}
_maquina = {"papel": "holyrics", "nome": PAPEIS["holyrics"], "principal": None}
_porta = {"valor": 8700}
_fatos = {"em": 0.0, "dados": {}}


def _carregar_maquina():
    dados = {}
    try:
        if os.path.exists(CAMINHO_MAQUINA):
            with open(CAMINHO_MAQUINA, "r", encoding="utf-8-sig") as arquivo:
                dados = yaml.safe_load(arquivo) or {}
    except Exception as erro:
        print("[aviso] maquina.yaml ignorado: {}".format(erro))
    papel = str(os.environ.get("PONTE_PAPEL") or dados.get("papel") or "holyrics").strip()
    if papel not in PAPEIS:
        print("[aviso] papel '{}' nao existe; usando 'holyrics'".format(papel))
        papel = "holyrics"
    principal = os.environ.get("PONTE_PRINCIPAL") or dados.get("principal")
    _maquina.update({
        "papel": papel,
        "nome": str(dados.get("nome") or PAPEIS[papel]),
        # A principal nao tem principal: ela e a ponta da linha.
        "principal": str(principal).rstrip("/") if principal and papel != "holyrics" else None,
    })
    if papel != "holyrics" and not _maquina["principal"]:
        print("[aviso] papel '{}' sem 'principal' no maquina.yaml: a pagina deste PC "
              "nao vai ter de onde ler o estado do culto".format(papel))


def _pedir_ao_principal(metodo, caminho, corpo=None, timeout=4.0, cru=False):
    """Fala com a maquina principal. Devolve (corpo, codigo_http)."""
    import urllib.error
    import urllib.request
    dados = json.dumps(corpo or {}).encode("utf-8") if metodo == "POST" else None
    pedido = urllib.request.Request(
        _maquina["principal"] + caminho, data=dados, method=metodo,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=timeout) as resposta:
            bruto = resposta.read()
            if cru:
                return (bruto, resposta.headers.get("Content-Type", "")), resposta.status
            return json.loads(bruto.decode("utf-8")), resposta.status
    except urllib.error.HTTPError as erro:
        try:
            return json.loads(erro.read().decode("utf-8")), erro.code
        except Exception:
            return {"erro": "a principal respondeu {}".format(erro.code)}, erro.code


def _fatos_locais():
    """O que da para saber SO olhando para este PC: que programas estao abertos.

    E o que deixa a pagina do notebook dizer "OBS aberto" mesmo se a rede ate
    a principal estiver ruim. Guardado por 5 segundos: `tasklist` nao e de
    graca, e a pagina pergunta a cada 3.
    """
    if time.time() - _fatos["em"] > 5:
        try:
            saida = subprocess.run(
                ["tasklist", "/FO", "CSV", "/NH"], capture_output=True, timeout=6,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            ).stdout.decode("cp850", errors="ignore").lower()
        except Exception:
            saida = ""
        _fatos["dados"] = {
            "obs_aberto": "obs64.exe" in saida or "obs32.exe" in saida,
            "reaper_aberto": "reaper.exe" in saida,
            "holyrics_aberto": "holyrics.exe" in saida,
        }
        _fatos["em"] = time.time()
    return dict(_fatos["dados"])


# -- o espelho na versao web -------------------------------------------------
_espelho = {"valor": None}


def _pedido_da_web(comando):
    """Executa aqui um pedido que alguem fez na versao web.

    So aceita os quatro tipos que a tela do guia sabe fazer. Qualquer outra
    coisa e ignorada: a web e uma maquina na internet, e o que ela pode pedir
    para a igreja tem que caber numa lista curta e conhecida.
    """
    tipo = comando.get("tipo")
    passo = str(comando.get("passo") or "")
    corpo = comando.get("corpo") or {}
    if tipo == "feito":
        _chegada.marcar(passo, feito=bool(corpo.get("feito", True)),
                        forcado=bool(corpo.get("forcado")))
    elif tipo == "acao":
        _chegada.agir(passo, corpo)
    elif tipo == "culto":
        _chegada.definir_culto(corpo.get("ordem"), corpo.get("hora"), corpo.get("presentes"))
    elif tipo == "recomecar":
        _chegada.recomecar()
    else:
        print("  [espelho] pedido desconhecido ignorado: {!r}".format(tipo))


def _montar_espelho():
    conf = _config.get("web") or {}
    # PONTE_WEB_URL / PONTE_WEB_CHAVE no ambiente servem para testar contra
    # uma versao web rodando nesta propria maquina, sem tocar no config.
    url = os.environ.get("PONTE_WEB_URL") or (conf.get("url") if conf.get("ativo") else None)
    chave = os.environ.get("PONTE_WEB_CHAVE") or conf.get("chave")
    if not url or _maquina["principal"] is not None:
        return None
    if not chave or str(chave).startswith("COLE-AQUI"):
        print("[aviso] versao web ligada no config, mas sem chave: espelho desligado")
        return None
    return mod_espelho.Espelho(url, chave, _chegada.retrato, _pedido_da_web,
                               nome=_maquina["nome"])


@app.get("/aqui")
def pagina_aqui():
    """A pagina DESTE PC: a que abre sozinha quando ele liga."""
    return send_from_directory(RAIZ, "aqui.html")


@app.get("/guia.js")
def guia_js():
    return send_from_directory(RAIZ, "guia.js")


@app.get("/guia.css")
def guia_css():
    return send_from_directory(RAIZ, "guia.css")


@app.get("/api/aqui")
def aqui_retrato():
    corpo = {
        "papel": _maquina["papel"], "nome": _maquina["nome"],
        "e_principal": _maquina["principal"] is None,
        "local": _fatos_locais(),
        # O endereco que o voluntario abre no celular e sempre o da PRINCIPAL.
        "painel_local": _maquina["principal"]
                        or "http://{}:{}".format(_ip_da_rede(), _porta["valor"]),
        "principal_ok": True, "chegada": None,
        "web": _espelho["valor"].retrato() if _espelho["valor"] else None,
    }
    if _maquina["principal"] is None:
        corpo["chegada"] = _chegada.retrato()
        return jsonify(corpo)
    try:
        dados, codigo = _pedir_ao_principal("GET", "/api/chegada")
        if codigo != 200:
            raise RuntimeError(dados.get("erro") or codigo)
        corpo["chegada"] = dados
    except Exception as erro:
        corpo["principal_ok"] = False
        corpo["erro"] = "sem contato com o PC do Holyrics: {}".format(erro)
    return jsonify(corpo)


def _local_ou_principal(caminho, local, timeout=4.0):
    """Executa aqui, se esta maquina e a principal; senao entrega a ela.

    `caminho` e o mesmo nos dois lados (/api/chegada/...). E isso que faz uma
    marca feita no PC do som aparecer no celular: ela nunca fica aqui.
    """
    corpo = request.get_json(silent=True) or {}
    if _maquina["principal"] is None:
        return local(corpo)
    try:
        dados, codigo = _pedir_ao_principal("POST", caminho, corpo, timeout=timeout)
    except Exception as erro:
        return jsonify({"ok": False, "erro": "sem contato com o PC do Holyrics: {}".format(erro),
                        "texto": "sem contato com o PC do Holyrics"}), 502
    return jsonify(dados), codigo


@app.post("/api/aqui/feito/<passo_id>")
def aqui_marcar(passo_id):
    return _local_ou_principal("/api/chegada/feito/" + passo_id,
                               lambda corpo: chegada_marcar(passo_id))


@app.post("/api/aqui/acao/<passo_id>")
def aqui_agir(passo_id):
    # 130s: abrir o retorno na TV leva uns 20 e o script tem ate 120.
    return _local_ou_principal("/api/chegada/acao/" + passo_id,
                               lambda corpo: chegada_agir(passo_id), timeout=130.0)


@app.post("/api/aqui/culto")
def aqui_culto():
    return _local_ou_principal("/api/chegada/culto", lambda corpo: chegada_culto())


@app.post("/api/aqui/recomecar")
def aqui_recomecar():
    return _local_ou_principal("/api/chegada/recomecar", lambda corpo: chegada_recomecar())


@app.get("/api/aqui/imagem")
def aqui_imagem():
    if _maquina["principal"] is None:
        return chegada_imagem()
    try:
        (dados, tipo), codigo = _pedir_ao_principal(
            "GET", "/api/chegada/imagem", timeout=15.0, cru=True)
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502
    resposta = Response(dados, mimetype=(tipo or "image/jpeg").split(";")[0], status=codigo)
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


# -- letras do dia -----------------------------------------------------------
#
# Musica que JA ESTA no acervo entra na lista do dia por aqui. Musica nova
# nao: criar musica no acervo pela API exige o Holyrics Plan, que a igreja nao
# tem (conferido em 12/11 — o token nao tem CreateItem). Para musica nova a
# tela formata a letra e a pessoa cola no Holyrics, como sempre fez.
_acervo = {"em": 0.0, "lista": []}


def _sem_acento(texto):
    import unicodedata
    texto = unicodedata.normalize("NFD", str(texto or ""))
    return "".join(c for c in texto if unicodedata.category(c) != "Mn").upper()


def _desembrulhar(corpo):
    return corpo.get("data") if isinstance(corpo, dict) and "data" in corpo else corpo


@app.get("/letras")
def pagina_letras():
    return send_from_directory(RAIZ, "letras.html")


@app.get("/api/letras/acervo")
def letras_acervo():
    cliente = _contexto.get("holyrics")
    if cliente is None:
        return jsonify({"erro": "Holyrics desligado no config.yaml"}), 400
    # 630 musicas a cada tecla digitada seria abuso: guarda por dois minutos.
    if time.time() - _acervo["em"] > 120:
        try:
            _acervo["lista"] = _desembrulhar(cliente.pedir("GetSongs", {})) or []
            _acervo["em"] = time.time()
        except Exception as erro:
            return jsonify({"erro": str(erro)}), 502
    alvo = _sem_acento(request.args.get("q", "")).strip()
    if len(alvo) < 2:
        return jsonify({"total": len(_acervo["lista"]), "musicas": []})
    achadas = [{"id": str(m.get("id")), "titulo": m.get("title") or "",
                "artista": m.get("artist") or ""}
               for m in _acervo["lista"]
               if isinstance(m, dict) and alvo in _sem_acento(m.get("title"))]
    return jsonify({"total": len(_acervo["lista"]), "musicas": achadas[:30]})


@app.get("/api/letras/lista")
def letras_lista():
    cliente = _contexto.get("holyrics")
    if cliente is None:
        return jsonify({"erro": "Holyrics desligado no config.yaml"}), 400
    try:
        lista = _desembrulhar(cliente.pedir("GetLyricsPlaylist", {})) or []
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502
    return jsonify({"musicas": [{"id": str(m.get("id")), "titulo": m.get("title") or ""}
                                for m in lista if isinstance(m, dict)]})


@app.post("/api/letras/lista/<identificador>")
def letras_por_na_lista(identificador):
    cliente = _contexto.get("holyrics")
    if cliente is None:
        return jsonify({"erro": "Holyrics desligado no config.yaml"}), 400
    try:
        cliente.pedir("AddLyricsToPlaylist", {"id": str(identificador)})
    except Exception as erro:
        return jsonify({"erro": str(erro)}), 502
    return letras_lista()


# -- inicializacao -----------------------------------------------------------


def _ip_da_rede():
    """Descobre o IP desta maquina na rede, pra mostrar no console."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Nao conecta de verdade (UDP), so faz o SO escolher a interface de saida.
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def _retomar_ordem(config):
    """Volta para onde o culto estava, se a ponte tiver sido reiniciada.

    Se nada foi salvo, ou o que foi salvo nao existe mais, carrega a ordem
    padrao do zero. Nunca estoura: perder o ponteiro e chato, mas nao pode
    impedir a ponte de subir.
    """
    salvo = {}
    try:
        if os.path.exists(CAMINHO_PONTEIRO):
            with open(CAMINHO_PONTEIRO, "r", encoding="utf-8") as arquivo:
                salvo = json.load(arquivo) or {}
    except Exception:
        salvo = {}

    with _tranca_ordem:
        if salvo.get("ordem") in _ordens_por_id:
            atual = salvo.get("atual")
            quantos = len(_ordens_por_id[salvo["ordem"]]["momentos"])
            if not (isinstance(atual, int) and 0 <= atual < quantos):
                atual = None
            _carregar_ordem(salvo["ordem"], atual)
            if atual is not None:
                print("  retomando: {} no momento {}".format(
                    _ordem["nome"], _ordem["momentos"][atual]))
            return
        padrao = config.get("ordem_padrao")
        if padrao in _ordens_por_id:
            _carregar_ordem(padrao)
        elif _ordens_por_id:
            _carregar_ordem(next(iter(_ordens_por_id)))


def main():
    global _config, _contexto, _cues_por_id, _ordens_por_id, _chegada

    _config = carregar_config()
    _contexto = montar_contexto(_config)
    _cues_por_id = indexar_cues(_config)
    _ordens_por_id = indexar_ordens(_config)
    _retomar_ordem(_config)
    _chegada = _montar_chegada()
    _carregar_maquina()

    servidor = _config.get("servidor") or {}
    host = servidor.get("host", "127.0.0.1")
    # PONTE_PORTA deixa subir uma SEGUNDA copia, em outra porta, sem um config
    # separado. Existe para testar mudanca com o culto no ar: a copia de teste
    # le o mesmo OBS e o mesmo Holyrics, mas ninguem a esta usando, e a ponte
    # de verdade nao e reiniciada no meio da pregacao.
    porta = int(os.environ.get("PONTE_PORTA") or servidor.get("porta", 8700))
    _porta["valor"] = porta

    print("\n" + "=" * 70)
    print("  PONTE DO CULTO — no ar")
    print("=" * 70)
    print("  Neste PC:        http://127.0.0.1:{}".format(porta))
    if host == "0.0.0.0":
        print("  Celular/tablet:  http://{}:{}".format(_ip_da_rede(), porta))
    print("  Este PC e:       {}{}".format(
        _maquina["nome"],
        "" if _maquina["principal"] is None
        else "  (principal: {})".format(_maquina["principal"])))
    print("  Cues carregadas: {}".format(len(_cues_por_id)))
    print("  Ordem do dia:    {} ({} momentos)".format(
        _ordem["nome"] or "nenhuma", len(_ordem["momentos"])))
    print("\n  Para parar, feche esta janela.")
    print("=" * 70 + "\n")

    # daemon: morre junto com a ponte, sem segurar o fechamento da janela
    threading.Thread(target=_atualizar_estado, daemon=True).start()
    _chegada.comecar()
    _espelho["valor"] = _montar_espelho()
    if _espelho["valor"] is not None:
        _espelho["valor"].comecar()
        print("  [espelho] ligado: entregando o estado para a versao web")

    app.run(host=host, port=porta, threaded=True, debug=False)


if __name__ == "__main__":
    main()
