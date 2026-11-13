"""Ponte do Culto — a versao web (ponte.igrejaparaiso.com.br).

O QUE ISTO E: um ESPELHO. A igreja manda, a web mostra.

A ponte de verdade roda dentro da rede da igreja e fala com OBS, Holyrics e
luzes. Esta aplicacao roda numa VPS e NUNCA chama a igreja: e a igreja que
liga para ca, a cada 2 segundos, entregando o estado do culto e levando os
pedidos que alguem fez por aqui. Por isso:

  * nao ha porta aberta no roteador da igreja;
  * se a internet da igreja cair, o culto nao sente — so esta pagina passa a
    dizer "sem contato com a igreja";
  * tudo que esta aplicacao sabe do culto e o ultimo retrato que recebeu.

O QUE ELA SERVE:
  /chegada   o guia do voluntario — os MESMOS arquivos da pasta ../pc
  /baixar    a versao para instalar nos PCs (a pasta ../pc, em .zip)
  /saude     para monitoramento: {"ok": true, "igreja": true|false}

SEGURANCA — este painel fica na internet, entao:
  * tudo pede senha (PONTE_SENHA), menos /saude e a tela de entrar;
  * a igreja se identifica com uma chave (PONTE_CHAVE), diferente da senha;
  * sem as duas variaveis a aplicacao SE RECUSA a subir: um painel que liga
    a transmissao de uma igreja nao pode nascer aberto por esquecimento;
  * o que a web pode pedir a igreja cabe em quatro tipos, e a igreja confere
    de novo do lado dela (ver _pedido_da_web no pc/app.py).

RODAR COM UM PROCESSO SO (gunicorn --workers 1 --threads 8): o estado mora na
memoria. Com dois processos, um receberia o retrato e o outro responderia a
tela com o retrato velho.
"""

import collections
import hmac
import io
import os
import secrets
import threading
import time
import zipfile
from datetime import timedelta

from flask import (Flask, jsonify, redirect, request, send_file,
                   send_from_directory, session)

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA_PC = os.path.normpath(os.path.join(AQUI, "..", "pc"))

SENHA = os.environ.get("PONTE_SENHA", "")
CHAVE = os.environ.get("PONTE_CHAVE", "")
if len(SENHA) < 8 or len(CHAVE) < 24:
    raise SystemExit(
        "A versao web nao sobe sem PONTE_SENHA (8+ caracteres) e PONTE_CHAVE "
        "(24+ caracteres) no ambiente. Veja apps/ponte/docs/IMPLANTAR-NA-VPS.md.")

# Quanto tempo sem a igreja ligar ate dizer "sem contato". Ela liga a cada 2s.
SILENCIO_MAXIMO = 15.0

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("PONTE_SEGREDO") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Atras de HTTPS (o normal na VPS) o cookie so viaja cifrado. PONTE_HTTP=1
    # desliga isso, e existe so para testar em http://127.0.0.1.
    SESSION_COOKIE_SECURE=os.environ.get("PONTE_HTTP") != "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)

_tranca = threading.Lock()
_igreja = {"chegada": None, "em": 0.0, "maquina": ""}
_fila = collections.deque(maxlen=50)
_tentativas = {}          # ip -> [quantas erradas, ate quando esta bloqueado]


def _igreja_viva():
    return _igreja["chegada"] is not None and time.time() - _igreja["em"] <= SILENCIO_MAXIMO


def _logado():
    return session.get("ok") is True


@app.before_request
def _porteiro():
    livre = ("/entrar", "/saude", "/api/espelho", "/guia.css")
    if request.path in livre or _logado():
        return None
    if request.path.startswith("/api/"):
        return jsonify({"erro": "entre com a senha", "entrar": True}), 401
    return redirect("/entrar")


# -- entrar ------------------------------------------------------------------

PAGINA_ENTRAR = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar — Ponte do Culto</title><link rel="stylesheet" href="/guia.css"></head>
<body><form class="tela" method="post" action="/entrar" style="max-width:520px;justify-content:center">
<div><h1 class="ola">Ponte do Culto</h1><div class="sub">Igreja Paraíso</div></div>
__AVISO__
<div class="pergunta"><label for="senha">Senha da equipe</label>
<input class="campo" style="width:100%" id="senha" name="senha" type="password" autocomplete="current-password" autofocus></div>
<button class="bt forte largo" type="submit">Entrar</button>
</form></body></html>"""


@app.get("/entrar")
def entrar():
    if _logado():
        return redirect("/chegada")
    return PAGINA_ENTRAR.replace("__AVISO__", "")


@app.post("/entrar")
def entrar_enviar():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    agora = time.time()
    with _tranca:
        erradas, ate = _tentativas.get(ip, [0, 0.0])
    if agora < ate:
        aviso = '<div class="faixa erro">Muitas tentativas. Espere um minuto.</div>'
        return PAGINA_ENTRAR.replace("__AVISO__", aviso), 429
    if hmac.compare_digest(request.form.get("senha", ""), SENHA):
        with _tranca:
            _tentativas.pop(ip, None)
        session.permanent = True
        session["ok"] = True
        return redirect("/chegada")
    # Cinco erradas seguidas travam aquele endereco por um minuto: a senha e
    # uma so, compartilhada pela equipe, entao adivinhar tem que custar caro.
    erradas += 1
    with _tranca:
        _tentativas[ip] = [0, agora + 60] if erradas >= 5 else [erradas, 0.0]
    time.sleep(1.0)
    aviso = '<div class="faixa erro">Senha errada.</div>'
    return PAGINA_ENTRAR.replace("__AVISO__", aviso), 401


@app.get("/sair")
def sair():
    session.clear()
    return redirect("/entrar")


# -- paginas: os mesmos arquivos que os PCs usam ------------------------------

@app.get("/")
def raiz():
    return redirect("/chegada")


@app.get("/chegada")
def pagina_chegada():
    return send_from_directory(PASTA_PC, "chegada.html")


@app.get("/guia.js")
def guia_js():
    return send_from_directory(PASTA_PC, "guia.js")


@app.get("/guia.css")
def guia_css():
    return send_from_directory(PASTA_PC, "guia.css")


# -- o que a tela pergunta ----------------------------------------------------

def _retrato_para_a_tela():
    with _tranca:
        viva = _igreja_viva()
        chegada = _igreja["chegada"]
        ha = time.time() - _igreja["em"] if _igreja["em"] else None
    corpo = {"papel": "web", "nome": "Painel na web", "e_principal": False, "local": {},
             "painel_local": "", "principal_ok": viva, "chegada": chegada}
    if not viva:
        corpo["erro"] = ("A igreja ainda não se conectou a esta versão web." if ha is None
                         else "Sem contato com a igreja há {:.0f} segundos. "
                              "O que está na tela pode estar velho.".format(ha))
    return corpo


@app.get("/api/aqui")
def aqui():
    return jsonify(_retrato_para_a_tela())


def _pedir(tipo, passo=None):
    """Poe um pedido na fila que a igreja busca. Nada acontece AQUI."""
    if not request.is_json:
        return jsonify({"erro": "pedido sem corpo JSON"}), 400
    with _tranca:
        if not _igreja_viva():
            return jsonify({"ok": False, "erro": "sem contato com a igreja",
                            "texto": "Sem contato com a igreja — o pedido não foi enviado."}), 503
        _fila.append({"tipo": tipo, "passo": passo,
                      "corpo": request.get_json(silent=True) or {}, "em": time.time()})
        chegada = _igreja["chegada"]
    if tipo == "acao":
        return jsonify({"ok": True, "chegada": chegada,
                        "texto": "Pedido enviado para a igreja. Acompanhe na tela."})
    # Para os outros a tela espera o retrato de volta. Vai o ultimo conhecido;
    # o novo chega na proxima vez que a igreja ligar, em uns 2 segundos.
    return jsonify(chegada)


@app.post("/api/aqui/feito/<passo_id>")
def aqui_feito(passo_id):
    return _pedir("feito", passo_id)


@app.post("/api/aqui/acao/<passo_id>")
def aqui_acao(passo_id):
    return _pedir("acao", passo_id)


@app.post("/api/aqui/culto")
def aqui_culto():
    return _pedir("culto")


@app.post("/api/aqui/recomecar")
def aqui_recomecar():
    return _pedir("recomecar")


@app.get("/api/aqui/imagem")
def aqui_imagem():
    # A foto do OBS nao sobe para a web: seria mandar a imagem do culto para a
    # internet a cada 2 segundos sem ninguem pedir.
    return jsonify({"erro": "a foto do OBS so aparece na rede da igreja"}), 404


# -- a igreja ligando ---------------------------------------------------------

@app.post("/api/espelho")
def espelho():
    """A ponte da igreja entrega o retrato e leva os pedidos."""
    if not hmac.compare_digest(request.headers.get("X-Ponte-Chave", ""), CHAVE):
        return jsonify({"erro": "chave errada"}), 403
    dados = request.get_json(silent=True) or {}
    chegada = dados.get("chegada")
    if not isinstance(chegada, dict) or "passos" not in chegada:
        return jsonify({"erro": "retrato invalido"}), 400
    agora = time.time()
    with _tranca:
        _igreja.update({"chegada": chegada, "em": agora, "maquina": str(dados.get("maquina") or "")})
        # Pedido velho nao e entregue: "abrir o retorno na TV" de 10 minutos
        # atras, chegando agora porque a internet voltou, e uma surpresa ruim.
        comandos = [c for c in _fila if agora - c["em"] <= 60]
        _fila.clear()
    return jsonify({"comandos": [{k: c[k] for k in ("tipo", "passo", "corpo")} for c in comandos]})


@app.get("/saude")
def saude():
    with _tranca:
        return jsonify({"ok": True, "igreja": _igreja_viva()})


# -- a versao para instalar nos PCs -------------------------------------------

@app.get("/baixar")
def baixar():
    """A pasta pc/ inteira, em .zip. E o que se instala em cada PC da igreja.

    Nao leva segredo nenhum: config.yaml e maquina.yaml nao existem no
    repositorio, so os .exemplo. Cada PC preenche os seus.
    """
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as pacote:
        for pasta, _subpastas, arquivos in os.walk(PASTA_PC):
            if "__pycache__" in pasta or ".venv" in pasta:
                continue
            for nome in arquivos:
                # Segunda tranca, alem do .gitignore: nada que seja segredo ou
                # estado DE UMA maquina viaja para outra, mesmo que alguem um
                # dia rode a ponte de dentro desta pasta e deixe arquivo aqui.
                if nome in ("config.yaml", "maquina.yaml") or nome.endswith((".log", ".wav")) \
                        or (nome.startswith("_") and nome.endswith(".json")):
                    continue
                caminho = os.path.join(pasta, nome)
                pacote.write(caminho, os.path.join("ponte-do-culto", os.path.relpath(caminho, PASTA_PC)))
    memoria.seek(0)
    return send_file(memoria, mimetype="application/zip", as_attachment=True,
                     download_name="ponte-do-culto-pc.zip")


if __name__ == "__main__":
    # So para teste local. Na VPS: gunicorn --workers 1 --threads 8 app:app
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8710)), threaded=True)
