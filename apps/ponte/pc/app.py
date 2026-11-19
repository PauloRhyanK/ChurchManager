"""Ponte do culto — servidor do painel.

Sobe um servidor local que serve o painel de botoes e, a cada clique, roda a
cue correspondente contra OBS, Holyrics e luzes.

Rode pelo INICIAR.bat. Para parar, feche a janela.
"""

import collections
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time

import yaml
from flask import Flask, Response, jsonify, request, send_from_directory

from ponte import atualizar as mod_atualizar
from ponte import condutor as mod_condutor
from ponte import obs_imagem as mod_obs_imagem
from ponte import obs_ouvinte as mod_obs_ouvinte
from ponte import painel_ao_vivo as mod_ao_vivo
from ponte import palavra as mod_palavra
from ponte import musico as mod_musico
from ponte import passador as mod_passador
from ponte import roteiro as mod_roteiro
from ponte import vs as mod_vs
from ponte import vs_reaper as mod_vs_reaper
from ponte import telao as mod_telao
from ponte import relogio as mod_relogio
from ponte import repertorio as mod_repertorio
from ponte import saude_envio as mod_saude_envio
from ponte import chegada as mod_chegada
from ponte import cofre as mod_cofre
from ponte import espelho as mod_espelho
from ponte import luzes as mod_luzes
from ponte import mesa as mod_mesa
from ponte import movimento as mod_movimento
from ponte import seguidor as mod_seguidor
from ponte import versao as mod_versao
from ponte import vigia_tv as mod_vigia_tv
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
    """O painel do culto ao vivo. O antigo continua em /painel-antigo, para o
    domingo em que este der problema."""
    return send_from_directory(RAIZ, "ao-vivo.html")


@app.get("/painel-antigo")
def painel_antigo():
    return send_from_directory(RAIZ, "painel.html")


@app.get("/ao-vivo.css")
def ao_vivo_css():
    return send_from_directory(RAIZ, "ao-vivo.css")


@app.get("/ao-vivo.js")
def ao_vivo_js():
    return send_from_directory(RAIZ, "ao-vivo.js")


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
_ordem = {"id": None, "nome": None, "momentos": [], "atual": None, "versao": 0,
          # momento -> instante em que o operador entrou nele. E o que deixa o
          # painel dizer "2 min atrasado" e quanto falta do momento atual.
          "entradas": {}}
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
            json.dump({"ordem": _ordem["id"], "atual": _ordem["atual"],
                       "entradas": _ordem.get("entradas") or {}}, arquivo)
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
        "entradas": {},
    })
    # Trocar ou recomecar a ordem e comecar outro culto: o link do celular do
    # pregador valia so para o anterior.
    if _pecas.get("palavra") is not None:
        _pecas["palavra"].encerrar_link()
    if _pecas.get("musico") is not None:
        _pecas["musico"].link.encerrar()
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
            _ordem.setdefault("entradas", {})[momento_id] = time.time()
            retrato = _retrato_da_ordem()

        _salvar_ponteiro()
        if _ao_vivo["valor"] is not None:
            try:
                _ao_vivo["valor"].momento_mudou(momento_id)
            except Exception as erro:
                print("  [painel] nao consegui encerrar o louvor: {}".format(erro))
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
    dados = {
        "no_ar": cenas.get("currentProgramSceneName"),
        "preview": cenas.get("currentPreviewSceneName"),
        "gravando": bool(gravacao.get("outputActive")),
        "transmitindo": bool(transmissao.get("outputActive")),
        "tempo_ms": transmissao.get("outputDuration") if transmissao.get("outputActive") else None,
        # O OBS lista as cenas de baixo para cima; a tela mostra como no OBS.
        "cenas": [c.get("sceneName") for c in reversed(cenas.get("scenes") or [])
                  if c.get("sceneName")],
        "gravacao_ms": gravacao.get("outputDuration") if gravacao.get("outputActive") else None,
        "disco_mb": None,
    }
    try:
        # Separado de proposito: se esta chamada falhar numa versao do OBS,
        # a tela perde so o espaco no disco, nao o estado inteiro.
        dados["disco_mb"] = cliente.pedir("GetStats").get("availableDiskSpace")
    except Exception:
        pass
    try:
        _saude_do_envio.ler(
            time.time(), dados["transmitindo"],
            perdidos=transmissao.get("outputSkippedFrames"),
            total=transmissao.get("outputTotalFrames"),
            bytes_=transmissao.get("outputBytes"),
            congestao=transmissao.get("outputCongestion"),
            reconectando=transmissao.get("outputReconnecting"))
    except Exception:
        pass
    return dados


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
            if _ao_vivo["valor"] is not None:
                _ao_vivo["valor"].vigiar_viradas(_sistemas_do_painel())
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
    corpo["retorno_tv"] = _vigia["valor"].retrato() if _vigia["valor"] else None
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
    _estudio_no_quadro(corpo, motor)    # so acrescenta algo com o estudio em uso
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


# -- Estudio de luz ----------------------------------------------------------
#
# A tela /estudio e para testar ideias FORA do culto: cor e direcao por luz,
# e uma animacao com velocidade, tamanho e atraso. Tudo aqui e isolado:
#
#   - nenhuma cue, momento ou botao do painel chama estas rotas;
#   - a cor e a direcao continuam indo por /api/luz/canais, como em /cenas;
#   - a animacao vai para o motor (ponte/movimento.py), que confere e LIMITA
#     tudo de novo — daqui so saem numeros de 0 a 100;
#   - "Parado" no painel (/api/luz/modo/parado) desliga tambem o que o estudio
#     tiver deixado rodando.
#
# E O PC DO SOM? Ele calcula o movimento la, e pode estar numa versao antiga.
# Por isso a animacao NAO vai no campo "modo" do quadro: vai numa chave nova,
# "estudio", que a versao antiga ignora. Para ela o modo segue "parado" e a
# luz fica quieta, na cor certa. Ver ponte/seguidor.py.
_estudio_visto = {"em": None, "sabe": False}


def _estudio_no_quadro(corpo, motor):
    """Chamado por /api/luz/quadro. Sem estudio em uso, NAO muda o quadro."""
    quem = request.remote_addr or ""
    if quem not in ("127.0.0.1", "::1"):
        _estudio_visto["em"] = time.time()
        _estudio_visto["sabe"] = request.args.get("sabe") == "estudio"
    espec = motor.estudio() if motor else None
    if espec is not None:
        corpo["estudio"] = espec


@app.get("/estudio")
def pagina_estudio():
    return send_from_directory(RAIZ, "estudio.html")


def _retrato_do_estudio(motor):
    cliente = _contexto.get("luzes")
    # Quem leva a luz ate os refletores? Com driver agente e o PC do som, e a
    # tela precisa saber se ele entende animacao do estudio.
    busca = None
    if cliente is not None and hasattr(cliente, "retrato"):
        recente = (_estudio_visto["em"] is not None
                   and time.time() - _estudio_visto["em"] < 10)
        busca = {"recente": recente, "sabe_animar": bool(recente and _estudio_visto["sabe"])}
    perigoso = next((m for m in (motor.catalogo() if motor else []) if m["perigoso"]), None)
    return {
        "ligado": cliente is not None,
        "motor": motor is not None,
        "busca": busca,
        "animaveis": motor.capacidades_estudio() if motor else {},
        "limites": motor.limites_estudio() if motor else {},
        "animacao": motor.estudio() if motor else None,
        "detalhe": motor.estudio_detalhe() if motor else None,
        "modo_do_culto": (motor.atual() if motor else None) or "parado",
        "piscar_forte": perigoso["id"] if perigoso else None,
    }


@app.get("/api/luz/estudio")
def luz_estudio():
    return jsonify(_retrato_do_estudio(_contexto.get("movimento")))


@app.post("/api/luz/estudio")
def luz_estudio_animar():
    """Liga, troca ou para a animacao do estudio. {"tipo": "parado"} para.

    O corpo traz o tipo, as luzes e tres numeros de 0 a 100. O que esses
    numeros viram (periodo, raio, cerca de pan/tilt) e decidido pelo motor.
    O estrobo NAO passa por aqui: tipo desconhecido e recusado.
    """
    motor = _contexto.get("movimento")
    if motor is None:
        return jsonify({"erro": "o motor de movimento nao carregou"}), 400
    if _contexto.get("luzes") is None:
        return jsonify({"erro": "as luzes estao desligadas neste computador"}), 400
    corpo = request.get_json(silent=True)
    if not isinstance(corpo, dict):
        return jsonify({"erro": "a animacao veio num formato estranho"}), 400
    try:
        motor.definir_estudio(corpo)
    except mod_movimento.ErroMovimento as erro:
        return jsonify({"erro": str(erro)}), 400

    # Mesmo motivo do /api/luz/modo: parar tem que valer na hora.
    try:
        _contexto["luzes"].reenviar()
    except Exception:
        pass
    return jsonify(_retrato_do_estudio(motor))


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
                "entra_sozinha": bool((t.get("contentDetails") or {}).get("enableAutoStart")),
            }
            break
    if "transmissao" not in corpo:
        # Para o formulario de preparar: o titulo da ultima serve de modelo
        # ("Sermao || Pr. Fulano"), e a pessoa so troca o que mudou.
        try:
            ultima = cliente.ultima_concluida()
        except Exception:
            ultima = None
        if ultima:
            corpo["ultima_titulo"] = (ultima.get("snippet") or {}).get("title") or ""
    return corpo


def _chave_do_obs_no_youtube(cliente):
    """Qual chave do YouTube o OBS esta usando. Devolve o id (nunca o valor).

    Primeiro pergunta ao OBS. Se o OBS nao responde, usa a chave da ultima
    transmissao do canal — que em 12/11 era a mesma ("Culto") em todas as
    oito ultimas.
    """
    obs = _contexto.get("obs")
    if obs is not None:
        try:
            atual = (obs.pedir("GetStreamServiceSettings")
                     .get("streamServiceSettings") or {}).get("key")
            if atual:
                for k in cliente.chaves():
                    if cliente.chave_de(k["id"])["chave"] == atual:
                        return k["id"], "a chave que o OBS esta usando"
        except Exception:
            pass
    ultima = cliente.ultima_concluida()
    presa = ((ultima or {}).get("contentDetails") or {}).get("boundStreamId")
    if presa:
        return presa, "a chave da ultima transmissao (o OBS nao respondeu)"
    return None, None


@app.post("/api/youtube/<cid>/preparar")
def youtube_preparar(cid):
    """Cria a transmissao de hoje antes de o OBS comecar. Ver ClienteYouTube.preparar."""
    canal, falha = _canal_yt(cid)
    if falha:
        return falha
    corpo = request.get_json(silent=True) or {}
    cliente = canal["cliente"]

    # Com o OBS no ar, a chave ja esta presa a uma transmissao AO VIVO. Prender
    # outra na mesma chave nesse momento e mexer no que o publico esta vendo.
    obs = _contexto.get("obs")
    if obs is not None:
        try:
            if obs.pedir("GetStreamStatus").get("outputActive"):
                return jsonify({"erro": "o OBS esta transmitindo agora. Prepare a "
                                        "proxima depois de parar esta."}), 409
        except Exception:
            pass

    try:
        id_stream, de_onde = _chave_do_obs_no_youtube(cliente)
        if not id_stream:
            return jsonify({"erro": "nao consegui saber qual chave o OBS usa"}), 409
        ultima = cliente.ultima_concluida()
        b, criada = cliente.preparar(
            corpo.get("titulo"), id_stream,
            privacidade=corpo.get("privacidade") or "unlisted",
            descricao=((ultima or {}).get("snippet") or {}).get("description"))
    except mod_youtube.ErroYouTube as erro:
        return jsonify({"erro": str(erro)}), 400
    print("  [youtube] transmissao {} ({}) presa a {}".format(
        "criada" if criada else "ja existia", b.get("id"), de_onde))
    retrato = _retrato_canal(cid, canal)
    retrato["criada"] = criada
    return jsonify(retrato)


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
    if _pecas.get("imagem") is not None:
        _pecas["imagem"].trocar_cliente(ClienteOBS(*argumentos, timeout=3.5, tentativas=1))


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
    import urllib.parse
    import urllib.request
    dados = json.dumps(corpo or {}).encode("utf-8") if metodo == "POST" else None
    pedido = urllib.request.Request(
        _maquina["principal"] + caminho, data=dados, method=metodo,
        headers={"Content-Type": "application/json",
                 # A principal anota quem falou com ela: e assim que o painel
                 # (e a versao web) sabem quais PCs estao vivos e em que versao.
                 "X-Ponte-Maquina": urllib.parse.quote(_maquina["nome"]),
                 "X-Ponte-Papel": _maquina["papel"],
                 "X-Ponte-Versao": _atualizacao["aqui"] or ""})
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
    elif tipo == "painel":
        # O painel do culto, pela web. A lista do que pode ser pedido e a
        # mesma do painel local (_acao_do_painel), e a chave "aceitar comandos
        # pela web" e conferida la dentro.
        _acao_do_painel(corpo, "web")
    elif tipo == "musico":
        # O toque do musico pelo celular, vindo pela internet. Como o do
        # pregador: o link e a autorizacao, e o codigo e conferido aqui.
        if _ao_vivo["valor"] is not None:
            _ao_vivo["valor"].musico_agir(str(corpo.get("codigo") or ""), str(corpo.get("acao") or ""), corpo)
    elif tipo == "pregador":
        # O toque do pregador pelo celular, vindo pela internet. Nao passa
        # pela chave "aceita comandos": o link dele e uma autorizacao a parte,
        # dada neste culto, e o codigo e conferido de novo aqui.
        if _ao_vivo["valor"] is not None:
            _ao_vivo["valor"].pregador_passar(
                str(corpo.get("codigo") or ""), corpo.get("para"), corpo.get("visto"))
    else:
        print("  [espelho] pedido desconhecido ignorado: {!r}".format(tipo))


def _conteudo_para_a_web():
    if _ao_vivo["valor"] is None:
        return None, None
    conteudo = _ao_vivo["valor"].conteudo()
    return conteudo["versao"], conteudo


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
                               nome=_maquina["nome"],
                               extra=lambda: {"painel": _retrato_do_painel()},
                               conteudo=_conteudo_para_a_web)


# -- o cofre na versao web ----------------------------------------------------
_cofre = {"valor": None}


def _montar_cofre():
    """So a principal guarda, e so se a versao web estiver ligada. `cofre:
    false` no bloco `web` do config desliga, para quem nao quer a
    configuracao fora da igreja."""
    conf = _config.get("web") or {}
    url = os.environ.get("PONTE_WEB_URL") or (conf.get("url") if conf.get("ativo") else None)
    chave = os.environ.get("PONTE_WEB_CHAVE") or conf.get("chave")
    if not url or not chave or str(chave).startswith("COLE-AQUI"):
        return None
    if _maquina["principal"] is not None or conf.get("cofre") is False:
        return None
    return mod_cofre.Cofre(url, chave, RAIZ, nome=_maquina["nome"])


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
        "cofre": _cofre["valor"].retrato() if _cofre["valor"] else None,
        "atualizacao": _retrato_da_atualizacao(),
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


# -- o pacote para instalar em outro PC --------------------------------------
#
# A versao web tem o seu /baixar, mas ela depende de VPS e de internet. Este
# aqui entrega o MESMO pacote pela rede da igreja: o notebook abre o painel,
# clica em "Instalar em outro PC" e recebe o projeto.
#
# E UMA LISTA DO QUE ENTRA, nao do que fica de fora — e a diferenca importa.
# Esta pasta tem o token do Holyrics, a senha do OBS, as credenciais do
# YouTube, um backup do OBS com a chave de transmissao e o acervo de letras.
# Com lista de exclusao, o proximo arquivo sensivel que alguem criar aqui
# viajaria junto sem ninguem perceber. Com lista de inclusao, arquivo novo so
# viaja se alguem escrever o nome dele abaixo.
PACOTE = (
    "app.py", "requirements.txt", "INSTALAR.md",
    "painel.html", "ao-vivo.html", "ao-vivo.css", "ao-vivo.js", "pregador.html", "musico.html", "louvor.html", "luzes.html", "cenas.html", "youtube.html",
    "chegada.html", "aqui.html", "letras.html", "guia.js", "guia.css",
    "estudio.html",
    "chegada.yaml", "looks_salvas.yaml", "patch.yaml",
    "config.exemplo.yaml", "maquina.exemplo.yaml", "config.secundaria.yaml",
    "configurar-este-pc.bat", "configurar-este-pc.ps1",
    "iniciar-ponte.bat", "iniciar-ponte.ps1", "iniciar.py", "instalar-do-zero.ps1",
    "ligar-web.py", "ligar-web.bat",
    "gerar_click.py",
    "verificar.py", "verificar_obs.py", "verificar_palavra.py", "descobrir_passador.py", "descobrir_holyrics.py", "descobrir_luzes.py",
)


@app.get("/baixar")
def baixar_pacote():
    import io
    import zipfile
    memoria = io.BytesIO()
    faltando = []
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as pacote:
        for nome in PACOTE:
            caminho = os.path.join(RAIZ, nome)
            if os.path.exists(caminho):
                pacote.write(caminho, os.path.join("ponte-do-culto", nome))
            else:
                faltando.append(nome)
        pasta = os.path.join(RAIZ, "ponte")
        for nome in sorted(os.listdir(pasta)):
            if nome.endswith(".py"):
                pacote.write(os.path.join(pasta, nome), os.path.join("ponte-do-culto", "ponte", nome))
    if faltando:
        print("  [baixar] ficaram de fora por nao existirem aqui: {}".format(", ".join(faltando)))
    memoria.seek(0)
    resposta = Response(memoria.getvalue(), mimetype="application/zip")
    resposta.headers["Content-Disposition"] = 'attachment; filename="ponte-do-culto-pc.zip"'
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
            # As horas de entrada so valem para o culto de hoje.
            entradas = salvo.get("entradas")
            if isinstance(entradas, dict):
                _ordem["entradas"] = {
                    str(m): float(quando) for m, quando in entradas.items()
                    if isinstance(quando, (int, float)) and time.time() - quando < 12 * 3600}
            if atual is not None:
                print("  retomando: {} no momento {}".format(
                    _ordem["nome"], _ordem["momentos"][atual]))
            return
        padrao = config.get("ordem_padrao")
        if padrao in _ordens_por_id:
            _carregar_ordem(padrao)
        elif _ordens_por_id:
            _carregar_ordem(next(iter(_ordens_por_id)))


# ---------------------------------------------------------------------------
#  O PAINEL DO CULTO
#
#  Uma rota para LER (/api/painel) e uma para AGIR (/api/painel/acao). E o
#  mesmo retrato e a mesma lista de acoes para a tela do PC, a do celular e a
#  da versao web: a web recebe o retrato pelo espelho e devolve as acoes pela
#  fila de pedidos. Por isso tudo aqui funciona SEM requisicao em curso (a
#  acao que vem da web roda numa thread do espelho).
#
#  O QUE A TELA PODE PEDIR cabe na lista de _acao_do_painel. Nao ha rota
#  generica "rode esta cue": o painel na internet nao pode virar um jeito de
#  rodar qualquer coisa do config.
# ---------------------------------------------------------------------------
_historico = collections.deque(maxlen=40)
_vigia = {"valor": None}      # o vigia do retorno na TV (ponte/vigia_tv.py)
_remoto = {"aceita": True}
_luz_escolhida = {"cena": None}
_ao_vivo = {"valor": None}    # ponte/painel_ao_vivo.py, montado no main()
_saude_do_envio = mod_saude_envio.SaudeDoEnvio()
# PONTE_SIMULAR=1 troca OBS e Holyrics pelos de ponte/simulados.py. So pelo
# ambiente, nunca pelo config: um culto nao pode ir ao ar contra um OBS
# inventado porque alguem esqueceu uma linha ligada.
SIMULAR = os.environ.get("PONTE_SIMULAR") == "1"
# O que o painel ao vivo precisa desta casa, como funcoes (ele nao importa o
# app.py). As pecas que so existem depois do main() entram la.
_pecas = {
    "config": lambda: _config,
    "simulacao": SIMULAR,
    "estado_obs": lambda: _estado.get("obs"),
    "obs": lambda: _contexto.get("obs"),
    "luz": lambda: _contexto.get("luzes"),
    "looks": lambda: _contexto.get("looks"),
    "motor": lambda: _contexto.get("movimento"),
    "cues": lambda: _cues_por_id,
    "entradas": lambda: dict(_ordem.get("entradas") or {}),
    "hora_do_culto": lambda: _hora_do_culto(),
    "luz_vista": lambda: _luz_vista.get("em"),
    "espelho": lambda: _espelho["valor"].retrato() if _espelho["valor"] else None,
    "saude": _saude_do_envio,
    "nome_de_cena": lambda nome: _nome_de_cena(nome),
    "luz_escolhida": lambda cena: _escolher_luz(cena),
    "reler_obs": lambda: _pedir_estado_ja(),
    "anotar": lambda titulo, ok, detalhe, origem: _anotar(titulo, ok, detalhe, origem),
    "ordem_agora": lambda: _ordem_agora(),
    "ir_para_cue": lambda cue_id: _ir_para_cue(cue_id),
}
_maquinas_vistas = {}
_yt_painel = {"em": 0.0, "dados": None, "pedir": True}
_atualizacao = {"aqui": None, "la": None, "em": None, "erro": None, "aplicando": False,
                "faltam": None}
CAMINHO_REMOTO = os.path.join(RAIZ, "_remoto.json")

# controle do painel -> (cue que liga, cue que desliga). Se a igreja nao tem
# as duas no config, o controle simplesmente nao aparece.
PARES = {
    "gravar": ("gravar", "parar_gravacao"),
    "transmitir": ("transmitir", "parar_transmissao"),
    "tela_preta": ("tela_preta", "tela_volta"),
}


def _nome_de_cena(nome):
    """'2. Louvor' -> 'Louvor'. Ou o apelido que a igreja deu em obs.apelidos."""
    if not nome:
        return None
    apelidos = (_config.get("obs") or {}).get("apelidos") or {}
    if nome in apelidos:
        return str(apelidos[nome])
    return re.sub(r"^\s*\d+\s*[.\-)]\s*", "", str(nome)) or str(nome)


# Os nomes das cenas sao ids, sem acento (e o que as cues usam). Na tela, os
# mais comuns voltam a ter acento; os outros, a igreja nomeia em luzes.nomes.
_ACENTOS = {"pregacao": "Pregação", "celebracao": "Celebração", "oracao": "Oração",
            "servico": "Serviço", "adoracao": "Adoração", "comunhao": "Comunhão",
            "ofertorio": "Ofertório", "transmissao": "Transmissão"}


def _nome_de_luz(nome):
    nomes = (_config.get("luzes") or {}).get("nomes") or {}
    chave = str(nome)
    if chave in nomes:
        return str(nomes[chave])
    return _ACENTOS.get(chave) or chave.replace("_", " ").strip().capitalize()


def _resumo_do_momento(cue):
    """O que o momento faz, em palavras de gente. Sai dos proprios passos."""
    if cue.get("descricao"):
        return str(cue["descricao"])
    frases = []
    for passo in cue.get("passos") or []:
        if not isinstance(passo, dict):
            continue
        frase = None
        if "luzes" in passo:
            alvo = str(passo["luzes"])
            frase = "apaga a luz" if alvo == "apagar" else "luz de " + _nome_de_luz(alvo).lower()
        elif "obs" in passo:
            dados = passo["obs"] or {}
            tipo = dados.get("requestType")
            cena = (dados.get("requestData") or {}).get("sceneName")
            if tipo in ("SetCurrentPreviewScene", "SetCurrentProgramScene") and cena:
                frase = "prepara a imagem " + _nome_de_cena(cena)
            else:
                frase = {"StartStream": "inicia a transmissão", "StopStream": "para a transmissão",
                         "StartRecord": "inicia a gravação", "StopRecord": "para a gravação"}.get(tipo)
        elif "obs_fonte" in passo:
            dados = passo["obs_fonte"] or {}
            if "letra" in str(dados.get("fonte", "")).lower():
                frase = ("mostra as letras na transmissão" if dados.get("visivel")
                         else "tira as letras da transmissão")
        elif "holyrics" in passo:
            dados = passo["holyrics"] or {}
            acao = dados.get("action")
            if acao == "SetF10":
                frase = ("deixa o telão preto" if (dados.get("payload") or {}).get("enable")
                         else "mostra o telão")
            elif acao == "CloseCurrentPresentation":
                frase = "fecha o que está no telão"
        if frase and frase not in frases:
            frases.append(frase)
    if not frases:
        return ""
    texto = ", ".join(frases)
    return texto[0].upper() + texto[1:] + "."


def _cena_de_luz_atual():
    """O nome da cena que esta acesa, quando da para saber."""
    cliente = _contexto.get("luzes")
    if cliente is None:
        return None
    if hasattr(cliente, "retrato"):
        try:
            acesos = {int(c): int(v) for c, v in (cliente.retrato().get("canais") or {}).items()}
        except Exception:
            acesos = None
        if acesos is not None:
            if not acesos:
                return "apagar"
            for nome, canais in (_contexto.get("looks") or {}).items():
                try:
                    if {int(c): int(v) for c, v in (canais or {}).items() if int(v)} == acesos:
                        return str(nome)
                except (TypeError, ValueError):
                    continue
            return None
    return _luz_escolhida["cena"]


def _sistemas_do_painel():
    """Quatro luzinhas, sem jargao e sem chamar ninguem na rede: sai do que a
    thread de estado ja leu."""
    with _tranca_estado:
        obs, holyrics = _estado.get("obs"), _estado.get("holyrics")
    itens = []

    def por(nome, ligado, ok, falha):
        if not ligado:
            itens.append({"nome": nome, "estado": "desligado", "detalhe": "desligado neste PC"})
        else:
            itens.append({"nome": nome, "estado": "ok" if ok else "erro",
                          "detalhe": "" if ok else falha})

    por("Transmissão", _contexto.get("obs_saude") is not None, obs is not None,
        "o OBS não responde. O notebook da transmissão está ligado, com o OBS aberto?")
    por("Telão", _contexto.get("holyrics_saude") is not None, holyrics is not None,
        "o Holyrics não responde. Ele está aberto neste PC?")
    luz = _contexto.get("luzes")
    if luz is not None and hasattr(luz, "retrato"):
        visto = _luz_vista.get("em")
        por("Luz", True, bool(visto and time.time() - visto < 12),
            "o PC do som não está buscando a luz. Ele está ligado, com a ponte aberta?")
    else:
        por("Luz", luz is not None, True, "")
    if _vigia["valor"] is not None:
        r = _vigia["valor"].retrato()
        if r["estado"] in ("caiu", "reconectando", "desistiu", "fora_da_janela"):
            itens.append({"nome": "Retorno na TV", "estado": "erro", "rotulo": r["texto"],
                          "detalhe": r["texto"] + ". A letra não está aparecendo na TV do altar."})
        elif r["estado"] == "no_ar":
            itens.append({"nome": "Retorno na TV", "estado": "ok", "detalhe": ""})
    espelho = _espelho["valor"].retrato() if _espelho["valor"] else None
    if espelho is not None:
        por("Painel na web", True, espelho.get("ok") is not False,
            "sem contato com a versão web. A internet caiu?")
    return itens


def _retrato_da_atualizacao():
    a = _atualizacao
    # `faltam` e a lista dos arquivos que a web tem e este PC nao tem igual.
    # Quando a web manda essa lista, e ELA que decide; a comparacao das duas
    # impressoes da pasta inteira so vale contra uma web antiga.
    if a["faltam"] is not None:
        disponivel = bool(a["faltam"])
    else:
        disponivel = bool(a["aqui"] and a["la"] and a["aqui"] != a["la"])
    return {"aqui": a["aqui"], "la": a["la"], "erro": a["erro"], "aplicando": a["aplicando"],
            "disponivel": disponivel, "faltam": (a["faltam"] or [])[:8]}


def _maquinas_do_painel():
    agora = time.time()
    lista = [{"nome": _maquina["nome"], "papel": _maquina["papel"],
              "versao": _atualizacao["aqui"], "viva": True, "esta": True}]
    for nome, m in sorted(_maquinas_vistas.items()):
        lista.append({"nome": nome, "papel": m["papel"], "versao": m["versao"],
                      "viva": agora - m["em"] < 30, "esta": False})
    return lista


def _retrato_do_painel():
    with _tranca_estado:
        obs, holyrics = _estado.get("obs"), _estado.get("holyrics")
    with _tranca_ordem:
        ordem = _retrato_da_ordem()
    for momento in ordem["momentos"]:
        momento["resumo"] = _resumo_do_momento(_cues_por_id.get(momento["id"]) or {})

    transmissao = None
    if obs is not None:
        preparada = obs.get("preview") if obs.get("preview") != obs.get("no_ar") else None
        transmissao = {
            "imagem": _nome_de_cena(obs.get("no_ar")),
            "preparada": _nome_de_cena(preparada),
            "no_ar": bool(obs.get("transmitindo")),
            "gravando": bool(obs.get("gravando")),
            "tempo_ms": obs.get("tempo_ms"),
            "youtube": _yt_painel["dados"],
        }
    telao = None
    if holyrics is not None:
        telao = {"vazio": bool(holyrics.get("vazio")), "nome": holyrics.get("nome") or "",
                 "slide": holyrics.get("slide"), "total": holyrics.get("total"),
                 "preta": holyrics.get("preta")}
    luz = None
    if _contexto.get("luzes") is not None:
        motor = _contexto.get("movimento")
        nomes = [str(n) for n in (_contexto.get("looks") or {}) if str(n) != "apagar"]
        luz = {
            "cena": _cena_de_luz_atual(),
            "cenas": [{"id": n, "nome": _nome_de_luz(n)} for n in sorted(nomes)],
            "modo": (motor.atual() if motor else None) or "parado",
            # Os perigosos (estrobo) nao entram no painel do culto.
            "modos": [{"id": m["id"], "nome": m["nome"], "descricao": m["descricao"]}
                      for m in (motor.catalogo() if motor else []) if not m["perigoso"]],
        }
    controles = {nome: all(c in _cues_por_id for c in par) for nome, par in PARES.items()}
    controles["cortar"] = _contexto.get("obs") is not None
    recados = [{"id": c["id"], "nome": c.get("nome", c["id"])} for c in _cues_por_id.values()
               if str(c["id"]).startswith("recado_") and c["id"] != "recado_limpar"]
    corpo = {
        "maquina": _maquina["nome"],
        "papel": _maquina["papel"],
        "hora": time.strftime("%H:%M"),
        "ordem": ordem,
        "ordens": [{"id": o["id"], "nome": o["nome"]} for o in _ordens_por_id.values()],
        "sistemas": _sistemas_do_painel(),
        "transmissao": transmissao,
        "telao": telao,
        "luz": luz,
        "controles": controles,
        "recados": recados,
        "tem_recado_limpar": "recado_limpar" in _cues_por_id,
        "retorno_tv": _vigia["valor"].retrato() if _vigia["valor"] else None,
        "historico": list(_historico)[:12],
        "remoto": dict(_remoto),
        "atualizacao": _retrato_da_atualizacao(),
        "maquinas": _maquinas_do_painel(),
    }
    # Daqui para baixo so se ACRESCENTA: o painel antigo e uma versao web
    # antiga leem as chaves de cima e ignoram o resto.
    if _ao_vivo["valor"] is not None:
        try:
            _ao_vivo["valor"].completar(corpo)
        except Exception as erro:
            print("  [painel] a parte nova do retrato falhou: {}".format(erro))
    return corpo


def _anotar(titulo, ok, detalhe, origem):
    _historico.appendleft({"hora": time.strftime("%H:%M"), "titulo": titulo, "ok": bool(ok),
                           "detalhe": detalhe, "origem": origem})


def _o_que_falhou(passos):
    falhas = [p for p in passos if p.get("estado") == "erro"]
    if not falhas:
        return "tudo certo"
    return "{} de {} passos falharam: {}".format(
        len(falhas), len(passos),
        "; ".join("{} ({})".format(p.get("rotulo") or p.get("sistema") or "passo",
                                   str(p.get("detalhe") or "")[:80]) for p in falhas[:3]))


def _ir_para_cue(cue_id):
    """Entra num momento pelo roteiro: se ele esta na ordem carregada, anda o
    ponteiro dela (e o painel antigo acompanha); senao, so executa o que o
    momento pede. Devolve {"ok", "detalhe"}."""
    with _tranca_ordem:
        indice = _ordem["momentos"].index(cue_id) if cue_id in _ordem["momentos"] else None
    if indice is not None:
        corpo, codigo = _transicionar(indice)
        if codigo != 200:
            return {"ok": False, "detalhe": corpo.get("erro") or "o momento não entrou"}
        return {"ok": corpo["tudo_ok"], "detalhe": _o_que_falhou(corpo["passos"])}
    corpo, codigo = _rodar_cue_do_painel(cue_id)
    return {"ok": codigo == 200 and bool(corpo.get("ok")), "detalhe": corpo.get("detalhe") or corpo.get("erro") or ""}


def _rodar_cue_do_painel(cue_id):
    cue = _cues_por_id.get(cue_id)
    if cue is None:
        return {"erro": "este PC não tem essa ação configurada"}, 404
    if not _tranca_de_cue.acquire(blocking=False):
        return {"erro": "outra ação ainda está rodando. Espere um instante.", "ocupado": True}, 409
    try:
        passos = executar(cue, _contexto)
    finally:
        _tranca_de_cue.release()
    ok = all(p["estado"] != "erro" for p in passos)
    return {"ok": ok, "titulo": cue.get("nome", cue_id), "detalhe": _o_que_falhou(passos)}, 200


def _luz_do_momento(cue):
    for passo in cue.get("passos") or []:
        if isinstance(passo, dict) and "luzes" in passo:
            return str(passo["luzes"])
    return None


def _acao_do_painel(dados, origem):
    """Executa UMA acao do painel. Devolve (corpo, codigo_http).

    `origem` e "local" (alguem na rede da igreja) ou "web". Tudo que passa
    por aqui fica anotado no historico, com a origem.
    """
    dados = dados if isinstance(dados, dict) else {}
    tipo = str(dados.get("tipo") or "")
    if origem == "web" and not _remoto["aceita"]:
        _anotar("Pedido pela web recusado", False,
                "os comandos pela web estão desligados neste PC", origem)
        return {"erro": "os comandos pela web estão desligados na igreja"}, 403
    titulo = tipo
    try:
        if tipo == "ir":
            momento = str(dados.get("momento") or "")
            with _tranca_ordem:
                if momento not in _ordem["momentos"]:
                    return {"erro": "esse momento não está na ordem de hoje"}, 404
                indice = _ordem["momentos"].index(momento)
            corpo, codigo = _transicionar(indice, dados.get("versao"))
            cue = _cues_por_id.get(momento) or {}
            titulo = cue.get("nome", momento)
            if codigo != 200:
                if corpo.get("conflito"):
                    corpo["erro"] = "alguém mudou o momento agora há pouco. Confira a tela e toque de novo."
                elif corpo.get("ocupado"):
                    corpo["erro"] = "outra ação ainda está rodando. Espere um instante."
                return corpo, codigo
            _luz_escolhida["cena"] = _luz_do_momento(cue) or _luz_escolhida["cena"]
            resultado = {"ok": corpo["tudo_ok"], "titulo": titulo,
                         "detalhe": _o_que_falhou(corpo["passos"])}
        elif tipo in PARES:
            liga, desliga = PARES[tipo]
            resultado, codigo = _rodar_cue_do_painel(liga if dados.get("ligar") else desliga)
            if codigo != 200:
                return resultado, codigo
            titulo = resultado["titulo"]
            if tipo == "transmitir":
                _yt_painel["pedir"] = True
        elif tipo == "recado":
            alvo = str(dados.get("id") or "")
            if not alvo.startswith("recado_"):
                return {"erro": "recado desconhecido"}, 400
            resultado, codigo = _rodar_cue_do_painel(alvo)
            if codigo != 200:
                return resultado, codigo
            titulo = resultado["titulo"]
        elif tipo in ("cena_luz", "apagar_luz"):
            cliente = _contexto.get("luzes")
            if cliente is None:
                return {"erro": "a luz está desligada neste PC"}, 400
            canais = {numero: 0 for numero in range(1, 513)}
            nome = "apagar"
            if tipo == "cena_luz":
                nome = str(dados.get("cena") or "")
                look = (_contexto.get("looks") or {}).get(nome)
                if look is None:
                    return {"erro": "essa cena de luz não existe mais"}, 404
                for canal, valor in look.items():
                    canais[int(canal)] = int(valor)
            cliente.aplicar(canais)
            _luz_escolhida["cena"] = nome
            if _ao_vivo["valor"] is not None:
                _ao_vivo["valor"].luz_mexida()
            titulo = "Luz apagada" if tipo == "apagar_luz" else "Luz: " + _nome_de_luz(nome)
            resultado = {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}
        elif tipo == "modo_luz":
            motor = _contexto.get("movimento")
            if motor is None:
                return {"erro": "o movimento de luz não está disponível neste PC"}, 400
            nome = str(dados.get("modo") or "parado")
            if any(m["id"] == nome and m["perigoso"] for m in motor.catalogo()):
                return {"erro": "esse movimento só pode ser ligado no estúdio de luz"}, 403
            try:
                escolhido = motor.escolher(None if nome == "parado" else nome)
            except mod_movimento.ErroMovimento:
                return {"erro": "esse movimento não existe"}, 404
            cliente = _contexto.get("luzes")
            if cliente is not None:
                try:
                    cliente.reenviar()
                except Exception:
                    pass
            if _ao_vivo["valor"] is not None:
                _ao_vivo["valor"].luz_mexida()
            titulo = "Movimento da luz: " + (escolhido or "parado")
            resultado = {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}
        elif tipo == "cortar":
            cliente = _contexto.get("obs")
            if cliente is None:
                return {"erro": "a transmissão está desligada neste PC"}, 400
            cliente.pedir("TriggerStudioModeTransition")
            titulo = "Imagem preparada posta no ar"
            resultado = {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}
        elif tipo == "visibilidade":
            valor = str(dados.get("valor") or "")
            if valor not in ("public", "unlisted"):
                return {"erro": "visibilidade desconhecida"}, 400
            feito = False
            for canal in (_contexto.get("youtube") or {}).values():
                cliente = canal["cliente"]
                if not cliente.autorizado():
                    continue
                atual = cliente.transmissao("active") or cliente.transmissao("upcoming")
                if atual:
                    cliente.atualizar(atual, privacidade=valor)
                    feito = True
                    break
            if not feito:
                return {"erro": "não achei uma transmissão no YouTube para mudar. "
                                "Ela já foi preparada?"}, 409
            _yt_painel["pedir"] = True
            titulo = ("Transmissão aberta ao público" if valor == "public"
                      else "Transmissão só para quem tem o link")
            resultado = {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}
        elif tipo == "retorno":
            vigia = _vigia["valor"]
            if vigia is None:
                return {"erro": "este PC não cuida do retorno na TV"}, 400
            oque = str(dados.get("acao") or "")
            if oque == "pausar":
                vigia.pausar(dados.get("minutos"))
                titulo = "Vigia do retorno pausado"
            elif oque == "retomar":
                vigia.retomar()
                titulo = "Vigia do retorno retomado"
            elif oque == "reabrir":
                # Abrir o retorno leva uns 20 segundos: vai numa thread, e a
                # tela acompanha pelo estado do vigia.
                def reabrir():
                    ok, texto = _chegada.reabrir_retorno()
                    _anotar("Retorno na TV", ok, texto, origem)
                threading.Thread(target=reabrir, daemon=True).start()
                return {"ok": True, "titulo": "Reabrindo o retorno na TV",
                        "detalhe": "leva uns 20 segundos"}, 200
            else:
                return {"erro": "o painel não sabe fazer isso"}, 400
            resultado = {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}
        elif tipo == "ordem":
            with _tranca_ordem:
                if not _carregar_ordem(str(dados.get("id") or "")):
                    return {"erro": "essa ordem de culto não existe"}, 404
            _salvar_ponteiro()
            titulo = "Ordem do culto: " + (_ordem["nome"] or "")
            resultado = {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}
        elif _ao_vivo["valor"] is not None and tipo in mod_ao_vivo.ACOES:
            # As acoes do painel ao vivo (ponte/painel_ao_vivo.py). Continua
            # sendo lista fechada: so entra aqui o que esta em ACOES.
            resultado, codigo = _ao_vivo["valor"].acao(tipo, dados, origem)
            if codigo != 200:
                return resultado, codigo
            if resultado.pop("silencioso", False):
                return resultado, 200
        else:
            return {"erro": "o painel não sabe fazer isso"}, 400
    except Exception as erro:
        _anotar(titulo, False, str(erro)[:160], origem)
        return {"erro": "não deu certo: " + str(erro)[:160]}, 502
    _anotar(resultado["titulo"], resultado["ok"], resultado["detalhe"], origem)
    return resultado, 200


@app.before_request
def _anotar_quem_falou():
    """Uma maquina secundaria se apresenta em cada pedido (ver
    _pedir_ao_principal). Guardar isso custa nada e responde 'o notebook esta
    vivo? em que versao?' sem ninguem ir ate la."""
    nome = request.headers.get("X-Ponte-Maquina")
    if nome:
        import urllib.parse
        _maquinas_vistas[urllib.parse.unquote(nome)[:60]] = {
            "papel": request.headers.get("X-Ponte-Papel", "")[:20],
            "versao": request.headers.get("X-Ponte-Versao", "")[:20] or None,
            "em": time.time()}
    return None


@app.post("/api/retorno/pausar")
def retorno_pausar():
    """Corpo opcional {"minutos": 30}; sem corpo, pausa ate o fim do dia."""
    corpo, codigo = _acao_do_painel(
        {"tipo": "retorno", "acao": "pausar",
         "minutos": (request.get_json(silent=True) or {}).get("minutos")}, "local")
    return jsonify(corpo), codigo


@app.post("/api/retorno/retomar")
def retorno_retomar():
    corpo, codigo = _acao_do_painel({"tipo": "retorno", "acao": "retomar"}, "local")
    return jsonify(corpo), codigo


@app.get("/api/painel")
def painel_retrato():
    corpo = _retrato_do_painel()
    corpo["local"] = True
    return jsonify(corpo)


@app.post("/api/painel/acao")
def painel_acao():
    corpo, codigo = _acao_do_painel(request.get_json(silent=True) or {}, "local")
    return jsonify(corpo), codigo


@app.post("/api/painel/remoto")
def painel_remoto():
    """Liga e desliga 'aceitar comandos pela web'. So existe AQUI, na rede da
    igreja: a versao web nao tem como religar a si mesma."""
    _remoto["aceita"] = bool((request.get_json(silent=True) or {}).get("aceita"))
    try:
        with open(CAMINHO_REMOTO, "w", encoding="utf-8") as arq:
            json.dump(_remoto, arq)
    except OSError:
        pass
    _anotar("Comandos pela web " + ("ligados" if _remoto["aceita"] else "desligados"),
            True, "tudo certo", "local")
    return jsonify(_remoto)


# -- o painel ao vivo ----------------------------------------------------------
#
# As pecas moram em ponte/ (condutor, relogio, repertorio, obs_imagem,
# obs_ouvinte, saude_envio, painel_ao_vivo). Aqui fica so a cola.

@app.get("/api/painel/conteudo")
def painel_conteudo():
    """O que e grande e muda pouco: a letra das musicas do dia. A tela so
    busca de novo quando `conteudo_versao` do retrato muda."""
    if _ao_vivo["valor"] is None:
        return jsonify({"versao": None, "musicas": []})
    return jsonify(_ao_vivo["valor"].conteudo())


@app.get("/api/painel/imagem")
def painel_imagem():
    """A imagem ao vivo do OBS. So existe aqui, na rede da igreja: a versao
    web nao a recebe, para nao pesar a internet durante a transmissao."""
    imagem = _pecas.get("imagem")
    dados, tipo, idade = imagem.pegar() if imagem is not None else (None, "", None)
    if not dados or idade is None or idade > 5:
        return Response(status=204)
    resposta = Response(dados, mimetype=tipo)
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


@app.post("/api/relogio")
def relogio_avisar():
    """Uma FONTE dizendo em que segundo a musica esta (ver ponte/relogio.py).

    Hoje quem avisa e a tela tocando o audio no ensaio; depois sera a ponte do
    PC do som, lendo o Reaper. A rota e a mesma.
    """
    relogio = _pecas.get("relogio")
    if relogio is None:
        return jsonify({"erro": "este PC não conduz o louvor"}), 400
    corpo = request.get_json(silent=True) or {}
    aceito = relogio.avisar(str(corpo.get("fonte") or ""), corpo.get("musica"),
                            corpo.get("posicao"), bool(corpo.get("tocando")))
    return jsonify({"aceito": aceito})


@app.post("/api/passador/simular")
def passador_simular():
    """So existe com PONTE_SIMULAR=1: faz de conta que o passador mandou uma
    tecla, para ver o painel reagir sem o aparelho e sem Windows."""
    if not SIMULAR or _pecas.get("passador") is None:
        return jsonify({"erro": "só na simulação"}), 404
    corpo = request.get_json(silent=True) or {}
    codigo = mod_passador.TECLAS.get(str(corpo.get("tecla") or "PageDown"))
    feito = _pecas["passador"].tecla(
        str(corpo.get("dispositivo") or "\\\\?\\HID#VID_046D&PID_C53E&MI_00#simulado"), codigo or 0)
    return jsonify({"feito": feito})


CAMINHO_LOUVOR = os.path.join(RAIZ, "_louvor_atual.json")
# A palavra de hoje, no formato que o modulo Palavras do ChurchManager propos
# (ver ponte/palavra.py). Enquanto a rota de la nao existe, e este arquivo.
CAMINHO_PALAVRA = os.path.join(RAIZ, "_palavra_do_dia.json")


def _ordem_agora():
    with _tranca_ordem:
        return _retrato_da_ordem()


# -- o celular do pregador ----------------------------------------------------
#
# Uma pagina que so sabe passar os slides da palavra, aberta por um link que
# vale so naquele culto. Aqui e o caminho pelo Wi-Fi da igreja: o celular fala
# direto com este PC, sem atraso e sem internet. O caminho pela internet passa
# pela versao web, que entrega o toque na fila de pedidos (tipo "pregador").

def _pregador(codigo):
    ao_vivo = _ao_vivo["valor"]
    return ao_vivo.pregador_retrato(codigo) if ao_vivo is not None else None


@app.get("/pregador/<codigo>")
def pagina_pregador(codigo):
    if _pregador(codigo) is None:
        return Response("Este link não vale mais. Peça outro à equipe de multimídia.",
                        status=404, mimetype="text/plain; charset=utf-8")
    return send_from_directory(RAIZ, "pregador.html")


@app.get("/api/pregador/<codigo>")
def pregador_retrato(codigo):
    retrato = _pregador(codigo)
    if retrato is None:
        return jsonify({"erro": "este link não vale mais. Peça outro à equipe."}), 404
    retrato["local"] = True
    return jsonify(retrato)


@app.post("/api/pregador/<codigo>")
def pregador_passar(codigo):
    if _ao_vivo["valor"] is None:
        return jsonify({"erro": "este PC não conduz a palavra"}), 400
    corpo = request.get_json(silent=True) or {}
    resultado, status = _ao_vivo["valor"].pregador_passar(codigo, corpo.get("para"), corpo.get("visto"))
    return jsonify(resultado), status


# -- o celular do musico -------------------------------------------------------
#
# O mesmo desenho do celular do pregador: link com codigo que vale so neste
# culto, direto pelo Wi-Fi da igreja ou pela fila da versao web (tipo "musico").

@app.get("/musico/<codigo>")
def pagina_musico(codigo):
    if _ao_vivo["valor"] is None or _ao_vivo["valor"].musico_retrato(codigo) is None:
        return Response("Este link não vale mais. Peça outro à equipe de multimídia.",
                        status=404, mimetype="text/plain; charset=utf-8")
    return send_from_directory(RAIZ, "musico.html")


@app.get("/api/musico/<codigo>")
def musico_retrato(codigo):
    tela = _ao_vivo["valor"].musico_retrato(codigo) if _ao_vivo["valor"] is not None else None
    if tela is None:
        return jsonify({"erro": "este link não vale mais. Peça outro à equipe."}), 404
    tela["local"] = True
    return jsonify(tela)


@app.post("/api/musico/<codigo>")
def musico_agir(codigo):
    if _ao_vivo["valor"] is None:
        return jsonify({"erro": "este PC não conduz o louvor"}), 400
    corpo = request.get_json(silent=True) or {}
    resultado, status = _ao_vivo["valor"].musico_agir(codigo, str(corpo.get("acao") or ""), corpo)
    return jsonify(resultado), status


@app.get("/api/painel/musico")
def painel_musico():
    """Os enderecos do link do musico. So existe AQUI, como o do pregador."""
    musico = _pecas.get("musico")
    codigo = musico.link.codigo() if musico is not None else None
    if codigo is None:
        return jsonify({"ativo": False})
    web = (_config.get("web") or {})
    return jsonify({
        "ativo": True,
        "local": "http://{}:{}/musico/{}".format(_ip_da_rede(), _porta["valor"], codigo),
        "web": ("{}/musico/{}".format(str(web.get("url")).rstrip("/"), codigo)
                if _espelho["valor"] is not None and web.get("url") else None),
    })


@app.get("/api/vs/pedido")
def vs_pedido():
    """O ultimo pedido para o VS (ponte/vs.py). Quem toca o audio pergunta:
    a tela em ensaio, ou a ponte do PC do som. Com o VS desligado no config,
    a resposta e sempre "nada"."""
    transporte = _pecas.get("transporte")
    if transporte is None:
        return jsonify({"pedido": None, "ativo": False})
    return jsonify({"pedido": transporte.pedido(request.args.get("quem")), "ativo": transporte.ativo,
                    "driver": transporte.driver})


@app.get("/api/painel/pregador")
def painel_pregador():
    """Os enderecos do link do pregador, para o operador mostrar ou copiar.
    So existe AQUI: o codigo nunca viaja para a versao web por esta rota."""
    palavra = _pecas.get("palavra")
    codigo = palavra.codigo() if palavra is not None else None
    if codigo is None:
        return jsonify({"ativo": False})
    web = (_config.get("web") or {})
    return jsonify({
        "ativo": True,
        "local": "http://{}:{}/pregador/{}".format(_ip_da_rede(), _porta["valor"], codigo),
        "web": ("{}/pregador/{}".format(str(web.get("url")).rstrip("/"), codigo)
                if _espelho["valor"] is not None and web.get("url") else None),
    })


def _guardar_louvor(musica_id):
    try:
        with open(CAMINHO_LOUVOR, "w", encoding="utf-8") as arquivo:
            json.dump({"musica": musica_id, "dia": time.strftime("%Y-%m-%d")}, arquivo)
    except OSError:
        pass


def _louvor_lembrado():
    try:
        with open(CAMINHO_LOUVOR, "r", encoding="utf-8-sig") as arquivo:
            dados = json.load(arquivo) or {}
    except (OSError, ValueError):
        return None
    return dados.get("musica") if dados.get("dia") == time.strftime("%Y-%m-%d") else None


def _lembrar_se_ainda_e_louvor(ao_vivo):
    """A musica em que o louvor estava, se a ponte reiniciou NO MEIO dele. Se
    o culto ja esta em outro momento, nao ha o que retomar."""
    with _tranca_ordem:
        momentos, atual = _ordem["momentos"], _ordem["atual"]
        momento = momentos[atual] if atual is not None and atual < len(momentos) else None
    if momento not in ao_vivo.momentos_do_louvor():
        return None
    return _louvor_lembrado()


def _slides_do_holyrics(identificador):
    """O texto dos slides de uma musica. None se o Holyrics nao respondeu."""
    cliente = _contexto.get("holyrics_saude")
    if cliente is None:
        return None
    corpo = cliente.pedir("GetSong", {"id": str(identificador)})
    dados = corpo.get("data") if isinstance(corpo, dict) and "data" in corpo else corpo
    return (dados or {}).get("slides") or None


_musicas_do_holyrics = {"em": 0.0, "por_titulo": {}}


def _achar_no_holyrics(titulo):
    """O id, no Holyrics, da musica que tem este titulo. None se nao achar.

    As musicas do ChurchManager nao trazem o id do Holyrics, e e por ele que a
    letra vai ao telao. A lista do Holyrics e lida uma vez a cada 10 minutos.
    NAO TESTADO NA IGREJA: supoe que GetSongs devolve [{id, title}] e que o
    token tem permissao para ela.
    """
    cliente = _contexto.get("holyrics_saude")
    if cliente is None:
        return None
    if time.time() - _musicas_do_holyrics["em"] > 600:
        _musicas_do_holyrics["em"] = time.time()
        corpo = cliente.pedir("GetSongs")
        lista = corpo.get("data") if isinstance(corpo, dict) else corpo
        _musicas_do_holyrics["por_titulo"] = {
            _sem_acento(str(m.get("title") or "")).strip().lower(): m.get("id")
            for m in (lista or []) if isinstance(m, dict) and m.get("id")}
    return _musicas_do_holyrics["por_titulo"].get(_sem_acento(titulo).strip().lower())


def _fonte_da_palavra(fonte_cultos):
    """O arquivo local vale primeiro (e o que a equipe consegue corrigir a
    mao na hora); sem ele, a palavra que veio do ChurchManager."""
    local = mod_palavra.FontePalavraLocal(CAMINHO_PALAVRA).palavra

    def palavra():
        dela = local()
        if dela is None and fonte_cultos is not None:
            dela = fonte_cultos.palavra()
        return dela
    return palavra


def _musica_no_telao(musica):
    cliente = _contexto.get("holyrics")
    if cliente is None:
        raise RuntimeError("o telão está desligado neste PC")
    if not musica.get("holyrics_id"):
        raise RuntimeError("esta música não tem letra no Holyrics")
    cliente.pedir("ShowLyrics", {"id": musica["holyrics_id"]})


def _slide_no_telao(musica, slide):
    cliente = _contexto.get("holyrics")
    if cliente is None:
        raise RuntimeError("o telão está desligado neste PC")
    cliente.pedir("ActionGoToIndex", {"index": int(slide["indice"])})


def _hora_do_culto():
    culto = _chegada.culto() if _chegada is not None else None
    return (culto or {}).get("hora")


def _escolher_luz(cena):
    _luz_escolhida["cena"] = cena


def _pedir_estado_ja():
    """Depois de trocar de cena, nao esperar 3 segundos para a tela saber."""
    def ler():
        novo = _ler_estado_obs()
        if novo is not None:
            with _tranca_estado:
                _estado["obs"] = novo
    threading.Thread(target=ler, daemon=True).start()


def _alimentar_medidor_simulado():
    while True:
        try:
            _pecas["medidor"].receber(_contexto["obs"].niveis())
        except Exception:
            pass
        time.sleep(0.1)


def _montar_ao_vivo():
    """Monta as pecas do painel ao vivo. So na maquina principal: e ela que
    fala com o Holyrics e conduz a ordem do culto."""
    if _maquina["principal"] is not None:
        return None
    conf_painel = _config.get("painel") or {}
    conf_relogio = _config.get("relogio") or {}
    conf_imagem = conf_painel.get("imagem") or {}

    _pecas["relogio"] = mod_relogio.Relogio(
        str(conf_relogio.get("fonte") or "navegador"), conf_relogio.get("adiantar_ms") or 0)
    _pecas["medidor"] = mod_obs_ouvinte.Medidor()
    ao_vivo = mod_ao_vivo.PainelAoVivo(_pecas)
    conf_rep = dict(_config.get("repertorio") or {})
    # Endereco, slug e chave moram no bloco `cultos`; `repertorio.fonte` diz
    # de onde ler.
    for chave, valor in (_config.get("cultos") or {}).items():
        conf_rep.setdefault(chave, valor)
    fonte_cultos = None
    if conf_rep.get("fonte") == "cultos" and conf_rep.get("arquivo"):
        # O culto lido de um ARQUIVO desta pasta, no formato do ChurchManager
        # (ver roteiro.exemplo.json). Serve para ensaiar e testar sem internet.
        def do_arquivo(caminho=os.path.join(RAIZ, str(conf_rep["arquivo"]))):
            with open(caminho, "r", encoding="utf-8-sig") as arquivo:
                return json.load(arquivo)
        fonte_cultos = mod_repertorio.FonteCultos(
            "arquivo", "local", None, os.path.join(RAIZ, "_culto_do_dia.json"), ao_vivo.tabela,
            _achar_no_holyrics, buscar=do_arquivo)
    elif conf_rep.get("fonte") == "cultos" and conf_rep.get("url") and conf_rep.get("slug"):
        # As musicas montadas no ChurchManager; ver o fim de ponte/repertorio.py.
        fonte_cultos = mod_repertorio.FonteCultos(
            conf_rep["url"], conf_rep["slug"], conf_rep.get("chave"),
            os.path.join(RAIZ, "_culto_do_dia.json"), ao_vivo.tabela, _achar_no_holyrics)
    if fonte_cultos is not None:
        fonte_cultos.comecar()
        _pecas["repertorio"] = fonte_cultos
        print("  [louvor] musicas vindas do ChurchManager")
    else:
        _pecas["repertorio"] = mod_repertorio.FonteLocal(
            _config, _ler_marcas, _slides_do_holyrics, ao_vivo.tabela)
    _pecas["condutor"] = mod_condutor.Condutor(
        _pecas["relogio"], _pecas["repertorio"].musicas, _musica_no_telao, _slide_no_telao,
        ao_vivo.luz_da_parte, lambda titulo, ok, detalhe: _anotar(titulo, ok, detalhe, "local"),
        lembrado=_lembrar_se_ainda_e_louvor(ao_vivo), guardar=_guardar_louvor)
    _pecas["condutor"].comecar()
    # O roteiro (momentos e musicas intercalados), o VS e o celular do musico.
    _pecas["roteiro"] = mod_roteiro.Roteiro()
    _pecas["transporte"] = mod_vs.Transporte(_config.get("vs") or {}, _pecas["relogio"])
    _pecas["musico"] = mod_musico.Musico(
        _pecas["condutor"], _pecas["roteiro"], _pecas["transporte"], _pecas["relogio"],
        _pecas["repertorio"].musicas, ao_vivo.entrar_no_item,
        lambda titulo, ok, detalhe: _anotar(titulo, ok, detalhe, "músico"),
        sincronizar=ao_vivo._roteiro_em_dia,
        no_ar=lambda: bool((_estado.get("obs") or {}).get("transmitindo")))
    _pecas["musico"].comecar()
    if _pecas["transporte"].ativo:
        print("  [vs] ligado: os pedidos do músico vão para quem toca o áudio ({})".format(
            _pecas["transporte"].driver))
    # O que esta aberto no Holyrics, slide a slide (ponte/telao.py), e o
    # passador de slides que funciona com qualquer janela em foco
    # (ponte/passador.py). Os dois so na maquina principal.
    _pecas["telao"] = mod_telao.Telao(lambda: _contexto.get("holyrics"))
    _pecas["telao"].comecar()
    _pecas["passador"] = mod_passador.Passador(
        _config.get("passador") or {},
        lambda para: ao_vivo.passar(para, "Passador"),
        mod_passador.holyrics_em_foco, suportado=mod_passador.no_windows() or SIMULAR)
    if _pecas["passador"].ativo:
        if mod_passador.OuvinteDoTeclado(_pecas["passador"].tecla, _pecas["passador"].presentes).comecar():
            print("  [passador] ouvindo o passador de slides, com qualquer janela em foco")
    telao = mod_palavra.TelaoDaPalavra(lambda: _contexto.get("holyrics"), lambda: _config)
    _pecas["palavra"] = mod_palavra.Palavra(
        _fonte_da_palavra(fonte_cultos), telao.mostrar, telao.tirar,
        lambda titulo, ok, detalhe: _anotar(titulo, ok, detalhe, "local"))

    if _contexto.get("obs") is not None:
        if SIMULAR:
            cliente_da_imagem = _contexto["obs"]
            threading.Thread(target=_alimentar_medidor_simulado, daemon=True).start()
        else:
            cliente_da_imagem = ClienteOBS(*_args_obs(), timeout=3.5, tentativas=1)
            mod_obs_ouvinte.OuvinteOBS(_args_obs, _pecas["medidor"]).comecar()
        _pecas["imagem"] = mod_obs_imagem.ImagemDoOBS(
            cliente_da_imagem, lambda: (_estado.get("obs") or {}).get("no_ar"),
            intervalo=conf_imagem.get("intervalo", 1.0), largura=conf_imagem.get("largura", 480))
        _pecas["imagem"].ativo = conf_imagem.get("ativo", True) is not False
    return ao_vivo


# -- atualizacao ---------------------------------------------------------------

def _endereco_de_atualizacao():
    return ((_config.get("atualizacao") or {}).get("url")
            or (_config.get("web") or {}).get("url") or mod_atualizar.ENDERECO_PADRAO)


def _perguntar_a_versao():
    try:
        dela = mod_atualizar.consultar(_endereco_de_atualizacao())
        _atualizacao["la"] = dela["versao"]
        if isinstance(dela.get("arquivos"), dict):
            _atualizacao["faltam"] = mod_versao.diferentes(RAIZ, dela["arquivos"])
            if not _atualizacao["faltam"]:
                # Em dia: este PC passa a se apresentar com a versao da web,
                # mesmo que a pasta dele tenha mais coisa que o projeto.
                _atualizacao["aqui"] = dela["versao"]
        else:
            _atualizacao["faltam"] = None
        _atualizacao["erro"] = None
    except Exception as erro:
        _atualizacao["erro"] = type(erro).__name__
    _atualizacao["em"] = time.time()


@app.post("/api/atualizacao/conferir")
def atualizacao_conferir():
    """O botao 'Procurar atualizacao' do menu Mais: pergunta agora, em vez de
    esperar a proxima volta."""
    _perguntar_a_versao()
    return jsonify(_retrato_da_atualizacao())


def _vigiar_atualizacao():
    """De 2 em 2 minutos pergunta a versao web se ha projeto mais novo. So
    PERGUNTA: quem decide trazer e uma pessoa, pelo botao. (Eram 10 minutos;
    quem acabou de saber que saiu uma versao nao quer esperar tanto.)"""
    try:
        _atualizacao["aqui"] = mod_versao.calcular(RAIZ)
    except Exception as erro:
        _atualizacao["erro"] = str(erro)[:120]
        return
    # Chegou ate aqui e ficou no ar: a versao nova, se era nova, presta.
    threading.Timer(60.0, mod_atualizar.confirmar, args=(RAIZ,)).start()
    time.sleep(15)
    while True:
        _perguntar_a_versao()
        time.sleep(120)


@app.get("/api/atualizacao")
def atualizacao_retrato():
    return jsonify(_retrato_da_atualizacao())


@app.post("/api/painel/atualizar")
def painel_atualizar():
    """Traz o projeto novo e religa a ponte. A ponte some por alguns segundos:
    por isso e um botao, e nunca acontece sozinho com o PC ja ligado."""
    if _atualizacao["aplicando"]:
        return jsonify({"erro": "a atualização já está em andamento"}), 409
    if not os.environ.get("PONTE_INICIADA_PELO_LANCADOR"):
        return jsonify({"erro": "esta ponte foi aberta do jeito antigo e não sabe se religar. "
                                "Feche a janela preta e abra pelo atalho Ponte do Culto."}), 409
    if not _tranca_de_cue.acquire(blocking=False):
        return jsonify({"erro": "uma ação do culto está rodando. Espere e tente de novo."}), 409
    _tranca_de_cue.release()
    _atualizacao["aplicando"] = True

    def trabalhar():
        try:
            feito = mod_atualizar.aplicar(_endereco_de_atualizacao(), RAIZ)
            print("  [atualizacao] {} -> {}. Religando a ponte...".format(feito["de"], feito["para"]))
            time.sleep(1.0)
            os._exit(42)       # o iniciar.py entende 42 como "suba de novo"
        except Exception as erro:
            _atualizacao["erro"] = str(erro)[:160]
            _atualizacao["aplicando"] = False
            _anotar("Atualização", False, str(erro)[:160], "local")

    threading.Thread(target=trabalhar, daemon=True).start()
    return jsonify({"ok": True})


def _vigiar_youtube():
    """O titulo, o link e quem pode assistir. O YouTube cobra por consulta,
    entao isto roda de 2 em 2 minutos, ou logo depois de alguem mexer."""
    while True:
        if _yt_painel["pedir"] or time.time() - _yt_painel["em"] > 120:
            _yt_painel["pedir"] = False
            dados = None
            try:
                for cid, canal in (_contexto.get("youtube") or {}).items():
                    retrato = _retrato_canal(cid, canal)
                    if retrato.get("transmissao"):
                        t = retrato["transmissao"]
                        dados = {"titulo": t.get("titulo"), "link": t.get("link"),
                                 "publica": t.get("privacidade") == "public",
                                 "estado": t.get("estado"),
                                 "assistindo": None, "saude": None,
                                 "lido_em": time.strftime("%H:%M")}
                        if t.get("estado") == "active":
                            # Duas consultas a mais, so com a transmissao no
                            # ar. Falhar aqui nao pode apagar titulo e link.
                            try:
                                dados["assistindo"] = canal["cliente"].espectadores(t["id"])
                            except Exception:
                                pass
                            try:
                                if t.get("chave_presa"):
                                    dados["saude"] = canal["cliente"].saude_do_envio(t["chave_presa"])
                            except Exception:
                                pass
                        break
            except Exception:
                dados = _yt_painel["dados"]
            _yt_painel.update({"dados": dados, "em": time.time()})
        time.sleep(5)



def main():
    global _config, _contexto, _cues_por_id, _ordens_por_id, _chegada

    _config = carregar_config()
    _contexto = montar_contexto(_config)
    if SIMULAR:
        from ponte import simulados
        _contexto["obs"] = _contexto["obs_saude"] = simulados.ObsSimulado()
        _contexto["holyrics"] = _contexto["holyrics_saude"] = simulados.HolyricsSimulado()
        print("\n  *** SIMULACAO: o OBS e o Holyrics deste painel sao de mentira ***")
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
        # Enquanto houver link de pregador valendo, um segundo pedido fica
        # pendurado na web para o toque dele chegar na hora, e nao em ate 2 s.
        _espelho["valor"].comecar_espera_longa(
            lambda: (_pecas.get("palavra") is not None and _pecas["palavra"].tem_link())
            or (_pecas.get("musico") is not None and _pecas["musico"].link.codigo() is not None))
        print("  [espelho] ligado: entregando o estado para a versao web")
    # O vigia do retorno na TV: so no PC principal, e so se o chegada.yaml
    # diz onde esta o script que fala com a TV.
    conf_vigia = _config.get("vigia_tv") or {}
    if (_maquina["principal"] is None and conf_vigia.get("ativo", True) is not False
            and _chegada.tem_tv()):
        _vigia["valor"] = mod_vigia_tv.VigiaDaTV(
            conf_vigia, ip_da_tv=_chegada.ip_da_tv, na_tela=_chegada.tela_da_tv,
            reabrir=lambda: _chegada.reabrir_retorno(do_vigia=True))
        _chegada.ligar_vigia(_vigia["valor"])
        _vigia["valor"].comecar()
        print("  [retorno] vigia ligado: reabre o retorno na TV se ele cair")
    try:
        with open(CAMINHO_REMOTO, encoding="utf-8") as arq:
            _remoto["aceita"] = bool(json.load(arq).get("aceita", True))
    except (OSError, ValueError):
        pass
    # No PC do som, com o VS ligado para o Reaper: buscar os pedidos na
    # principal e mandar no Reaper (ponte/vs_reaper.py). Nunca rodou com um.
    conf_vs = _config.get("vs") or {}
    if (_maquina["principal"] is not None and _maquina["papel"] == "som"
            and conf_vs.get("ativo") and conf_vs.get("driver") == "reaper"):
        mod_vs_reaper.AgenteDoReaper(_maquina["principal"], conf_vs.get("reaper") or {}).comecar()
        print("  [vs] este PC obedece aos pedidos do VS e manda no Reaper")
    try:
        _ao_vivo["valor"] = _montar_ao_vivo()
    except Exception as erro:
        # O painel antigo nao depende de nada disto: se a parte nova nao
        # montar, a ponte sobe mesmo assim e /painel-antigo continua valendo.
        print("  [aviso] painel ao vivo desligado: {}".format(erro))
    threading.Thread(target=_vigiar_atualizacao, daemon=True).start()
    if _contexto.get("youtube"):
        threading.Thread(target=_vigiar_youtube, daemon=True).start()
    _cofre["valor"] = _montar_cofre()
    if _cofre["valor"] is not None:
        _cofre["valor"].comecar()
        print("  [cofre] ligado: guardando a configuracao na versao web")

    app.run(host=host, port=porta, threaded=True, debug=False)


if __name__ == "__main__":
    main()
