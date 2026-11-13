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
  /instalar  gera o instalador de um PC novo (um .bat com codigo temporario)

O COFRE: o PC principal entrega aqui a configuracao da igreja (config.yaml,
cenas de luz, a exportacao do OBS). E o que permite montar um PC novo do
zero, ja configurado, mesmo que o principal tenha morrido. Sao SEGREDOS, e
por isso so saem daqui para quem apresenta um codigo de instalacao, que so
quem esta logado consegue gerar e que vale por pouco tempo.

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

import base64
import collections
import hmac
import importlib.util
import io
import json
import os
import re
import secrets
import threading
import time
import zipfile
from datetime import timedelta

from flask import (Flask, jsonify, redirect, request, send_file,
                   send_from_directory, session)

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA_PC = os.path.normpath(os.path.join(AQUI, "..", "pc"))
# Onde o cofre mora. Fora do repositorio e fora da imagem: no conteiner e um
# volume, para sobreviver a reinicio e a atualizacao.
PASTA_DADOS = os.environ.get("PONTE_DADOS", "/dados")
ARQ_COFRE = os.path.join(PASTA_DADOS, "cofre.json")

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
    # 12 MB: a exportacao do OBS vai dentro do cofre, em base64.
    MAX_CONTENT_LENGTH=12 * 1024 * 1024,
)

# A versao do projeto que esta pasta pc/ tem. E com ela que cada PC descobre
# que esta atras. O calculo mora em pc/ponte/versao.py, para os dois lados
# usarem exatamente a mesma conta.
_espec = importlib.util.spec_from_file_location(
    "ponte_versao", os.path.join(PASTA_PC, "ponte", "versao.py"))
_mod_versao = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(_mod_versao)
VERSAO = _mod_versao.calcular(PASTA_PC)
SUBIU_EM = time.time()

_tranca = threading.Lock()
_igreja = {"chegada": None, "painel": None, "em": 0.0, "maquina": ""}
_fila = collections.deque(maxlen=50)
_tentativas = {}          # ip -> [quantas erradas, ate quando esta bloqueado]
_codigos = {}             # codigo de instalacao -> [vale ate, usos que restam]

VALIDADE_CODIGO = 30 * 60   # segundos
USOS_CODIGO = 5             # a instalacao pode falhar no meio e ser repetida
PAPEIS = ("holyrics", "transmissao", "som")


def _ip():
    """O endereco de quem esta do outro lado, para o limite de tentativas.

    Ha UM proxy na frente (o Nginx Proxy Manager), e ele ACRESCENTA o
    endereco real no FIM do X-Forwarded-For. O comeco do cabecalho e o que o
    visitante quiser escrever: a primeira versao lia o comeco, e bastava
    mandar um valor diferente a cada tentativa para nunca ser bloqueado.
    """
    partes = [p.strip() for p in request.headers.get("X-Forwarded-For", "").split(",") if p.strip()]
    return partes[-1] if partes else (request.remote_addr or "?")


def _bloqueado(ip):
    with _tranca:
        return time.time() < _tentativas.get(ip, [0, 0.0])[1]


def _errou(ip):
    """Cinco erradas seguidas travam aquele endereco por um minuto."""
    with _tranca:
        erradas = _tentativas.get(ip, [0, 0.0])[0] + 1
        _tentativas[ip] = [0, time.time() + 60] if erradas >= 5 else [erradas, 0.0]


def _igreja_viva():
    return _igreja["chegada"] is not None and time.time() - _igreja["em"] <= SILENCIO_MAXIMO


def _logado():
    return session.get("ok") is True


@app.before_request
def _porteiro():
    # /api/cofre e /api/instalar/pacote conferem a propria credencial (chave e
    # codigo); /instalar.ps1 e so o roteiro, sem segredo nenhum.
    livre = ("/entrar", "/saude", "/api/espelho", "/guia.css",
             "/api/cofre", "/api/instalar/pacote", "/instalar.ps1",
             # O projeto e publico (esta no GitHub): a versao e o pacote de
             # atualizacao nao levam segredo nenhum, e os PCs secundarios, que
             # nao guardam chave, precisam alcanca-los.
             "/api/versao", "/api/atualizacao/pacote")
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
        return redirect("/")
    return PAGINA_ENTRAR.replace("__AVISO__", "")


@app.post("/entrar")
def entrar_enviar():
    ip = _ip()
    if _bloqueado(ip):
        aviso = '<div class="faixa erro">Muitas tentativas. Espere um minuto.</div>'
        return PAGINA_ENTRAR.replace("__AVISO__", aviso), 429
    if hmac.compare_digest(request.form.get("senha", ""), SENHA):
        with _tranca:
            _tentativas.pop(ip, None)
        session.permanent = True
        session["ok"] = True
        return redirect("/")
    # A senha e uma so, compartilhada pela equipe, entao adivinhar tem que
    # custar caro.
    _errou(ip)
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
    return redirect("/painel")


@app.get("/painel")
def pagina_painel():
    """O painel do culto: o MESMO arquivo que o PC da igreja usa."""
    return send_from_directory(PASTA_PC, "painel.html")


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


# -- o painel do culto ---------------------------------------------------------

# O que a web pode pedir no painel. A igreja confere de novo do lado dela
# (_acao_do_painel no pc/app.py) e pode recusar tudo com uma chave no painel
# local. "ordem" (trocar a ordem do culto inteira) fica de fora de proposito.
ACOES_DO_PAINEL = ("ir", "gravar", "transmitir", "tela_preta", "recado", "cena_luz",
                   "apagar_luz", "modo_luz", "cortar", "visibilidade")


@app.get("/api/painel")
def painel_retrato():
    with _tranca:
        viva = _igreja_viva()
        painel = _igreja["painel"]
        ha = time.time() - _igreja["em"] if _igreja["em"] else None
    corpo = dict(painel or {})
    corpo.update({"local": False, "viva": viva, "versao_da_web": VERSAO})
    if not viva:
        corpo["erro"] = ("A igreja ainda não se conectou a esta versão web." if ha is None
                         else "Sem contato com a igreja há {:.0f} segundos. "
                              "O que está na tela pode estar velho.".format(ha))
    elif painel is None:
        corpo["erro"] = ("O PC da igreja está numa versão antiga, que ainda não manda o painel "
                         "do culto para cá. Atualize a ponte de lá.")
    return jsonify(corpo)


@app.post("/api/painel/acao")
def painel_acao():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict) or dados.get("tipo") not in ACOES_DO_PAINEL:
        return jsonify({"erro": "o painel na web não faz isso"}), 400
    with _tranca:
        if not _igreja_viva():
            return jsonify({"erro": "Sem contato com a igreja — o pedido não foi enviado."}), 503
        if not ((_igreja["painel"] or {}).get("remoto") or {}).get("aceita", False):
            return jsonify({"erro": "Os comandos pela web estão desligados na igreja."}), 403
        _fila.append({"tipo": "painel", "passo": None, "corpo": dados, "em": time.time()})
    return jsonify({"ok": True, "enviado": True,
                    "titulo": "Pedido enviado para a igreja", "detalhe": "acompanhe na tela"})


@app.get("/api/versao")
def versao():
    return jsonify({"versao": VERSAO, "em": SUBIU_EM})


@app.get("/api/atualizacao/pacote")
def atualizacao_pacote():
    """So o projeto. E o que um PC busca para se atualizar."""
    return send_file(_zip_pc(), mimetype="application/zip", as_attachment=True,
                     download_name="ponte-do-culto-pc.zip")


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
        painel = dados.get("painel")
        _igreja.update({"chegada": chegada, "em": agora, "maquina": str(dados.get("maquina") or ""),
                        "painel": painel if isinstance(painel, dict) else None})
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

def _zip_pc(extras=None):
    """A pasta pc/ inteira, em .zip, mais os arquivos do cofre que couberem.

    Do disco nao sai segredo nenhum: config.yaml e maquina.yaml nao existem
    no repositorio, so os .exemplo. O que e segredo so entra por `extras`, e
    quem decide os extras e a rota que conferiu o codigo de instalacao.
    """
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as pacote:
        for pasta, subpastas, arquivos in os.walk(PASTA_PC):
            # Segunda tranca, alem do .gitignore: nada que seja segredo ou
            # estado DE UMA maquina viaja para outra, mesmo que alguem um
            # dia rode a ponte de dentro desta pasta e deixe arquivo aqui.
            subpastas[:] = [d for d in subpastas if d not in ("__pycache__", ".venv", "obs")]
            for nome in arquivos:
                if nome in ("config.yaml", "maquina.yaml") or nome.endswith((".log", ".wav")) \
                        or (nome.startswith("_") and nome.endswith(".json")):
                    continue
                caminho = os.path.join(pasta, nome)
                pacote.write(caminho, os.path.join("ponte-do-culto", os.path.relpath(caminho, PASTA_PC)))
        nomes = set(pacote.namelist())
        for nome, conteudo in (extras or {}).items():
            destino = "ponte-do-culto/" + nome
            if destino in nomes:
                # A copia da igreja vence a do repositorio (cenas de luz e
                # passos da chegada mudam la, no dia a dia). O zip nao deixa
                # trocar um arquivo ja escrito, entao a do cofre vai com
                # outro nome e o instalador poe no lugar.
                destino = "ponte-do-culto/_do_cofre/" + nome
            pacote.writestr(destino, conteudo)
    memoria.seek(0)
    return memoria


@app.get("/baixar")
def baixar():
    """So o projeto, sem configuracao: para atualizar um PC ja instalado."""
    return send_file(_zip_pc(), mimetype="application/zip", as_attachment=True,
                     download_name="ponte-do-culto-pc.zip")


# -- o cofre ------------------------------------------------------------------

# Nomes que o cofre aceita: sem "..", sem barra no comeco, no maximo tres
# pastas (obs/profiles/<nome>/arquivo). O nome vira caminho no PC que instalar; um nome malicioso
# escreveria fora da pasta da ponte.
_NOME_OK = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_. ()\-]{0,80}(/[A-Za-z0-9_][A-Za-z0-9_. ()\-]{0,80}){0,3}$")


def _ler_cofre():
    try:
        with open(ARQ_COFRE, encoding="utf-8") as arq:
            return json.load(arq)
    except (OSError, ValueError):
        return None


def _do_papel(nome, papel):
    """O que cada papel recebe. Segredo so vai para quem precisa dele."""
    if nome == "config.yaml":
        return papel == "holyrics"          # token do Holyrics, senha do OBS, chave da web
    if nome.startswith("obs/"):
        return papel in ("holyrics", "transmissao")   # tem a chave do YouTube
    return True                              # cenas de luz, passos da chegada


@app.post("/api/cofre")
def cofre_guardar():
    """O PC principal entrega a configuracao da igreja. Substitui a anterior."""
    if not hmac.compare_digest(request.headers.get("X-Ponte-Chave", ""), CHAVE):
        return jsonify({"erro": "chave errada"}), 403
    dados = request.get_json(silent=True) or {}
    arquivos = dados.get("arquivos")
    if not isinstance(arquivos, dict) or not arquivos or len(arquivos) > 60:
        return jsonify({"erro": "cofre invalido"}), 400
    for nome, conteudo in arquivos.items():
        if not isinstance(nome, str) or not _NOME_OK.match(nome) or not isinstance(conteudo, str):
            return jsonify({"erro": "nome de arquivo recusado"}), 400
        try:
            base64.b64decode(conteudo, validate=True)
        except ValueError:
            return jsonify({"erro": "conteudo invalido"}), 400
    registro = {"em": time.time(), "maquina": str(dados.get("maquina") or "")[:80],
                "arquivos": arquivos}
    try:
        os.makedirs(PASTA_DADOS, exist_ok=True)
        provisorio = ARQ_COFRE + ".novo"
        # 0600 desde a criacao: o arquivo nunca existe legivel por outros.
        with os.fdopen(os.open(provisorio, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600),
                       "w", encoding="utf-8") as arq:
            json.dump(registro, arq)
        os.replace(provisorio, ARQ_COFRE)
    except OSError as erro:
        return jsonify({"erro": "nao consegui guardar: " + type(erro).__name__}), 500
    return jsonify({"ok": True, "arquivos": len(arquivos)})


@app.get("/api/cofre")
def cofre_estado():
    """So o que ha no cofre e de quando. O conteudo nunca sai por aqui."""
    # A rota esta na lista livre por causa do POST da igreja (que confere a
    # chave); o GET e de quem esta logado.
    if not _logado():
        return jsonify({"erro": "entre com a senha", "entrar": True}), 401
    cofre = _ler_cofre()
    if not cofre:
        return jsonify({"tem": False})
    return jsonify({"tem": True, "em": cofre.get("em"), "maquina": cofre.get("maquina"),
                    "arquivos": sorted(cofre.get("arquivos") or {})})


# -- instalar um PC do zero ---------------------------------------------------

PAGINA_INSTALAR = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instalar num PC — Ponte do Culto</title><link rel="stylesheet" href="/guia.css"></head>
<body><div class="tela" style="max-width:720px">
<div><h1 class="ola">Instalar num PC</h1>
<div class="sub">Baixe o instalador <b>no PC que vai ser instalado</b> e dê dois cliques nele.</div></div>
__COFRE__
<a class="bt forte largo" href="/baixar/instalador">Baixar o instalador</a>
<div class="sub" style="font-size:16px">O instalador vale por 30 minutos e serve para este PC.
Ele pergunta que PC é este, instala o que faltar e traz a configuração da igreja.
<b>Não mande o arquivo por mensagem</b>: quem tiver o arquivo, dentro desse prazo, recebe os segredos da igreja.</div>
<a class="leve" href="/chegada">Voltar</a>
</div></body></html>"""


@app.get("/instalar")
def instalar():
    cofre = _ler_cofre()
    if cofre:
        quando = time.strftime("%d/%m/%Y %H:%M", time.localtime(cofre.get("em") or 0))
        faixa = ('<div class="faixa aviso">Configuração da igreja guardada em <b>{}</b> ({} arquivos).</div>'
                 .format(quando, len(cofre.get("arquivos") or {})))
    else:
        faixa = ('<div class="faixa erro">A igreja ainda não entregou a configuração. O instalador '
                 'instala o projeto, mas o PC principal vai precisar dos segredos digitados à mão.</div>')
    return PAGINA_INSTALAR.replace("__COFRE__", faixa)


@app.get("/baixar/instalador")
def baixar_instalador():
    """Um .bat pequeno com um codigo temporario dentro. Toda a logica esta no
    /instalar.ps1, que ele busca daqui: assim o roteiro se atualiza sem
    ninguem precisar baixar o .bat de novo."""
    agora = time.time()
    codigo = secrets.token_urlsafe(24)
    with _tranca:
        for velho in [c for c, (ate, _usos) in _codigos.items() if ate < agora]:
            del _codigos[velho]
        _codigos[codigo] = [agora + VALIDADE_CODIGO, USOS_CODIGO]
    endereco = ("http://" if os.environ.get("PONTE_HTTP") == "1" else "https://") + request.host
    linhas = [
        "@echo off",
        "rem Ponte do Culto - instalador deste PC. Vale por 30 minutos.",
        "rem NAO MANDE ESTE ARQUIVO POR MENSAGEM: ele da acesso aos segredos da igreja.",
        'set "PONTE_URL={}"'.format(endereco),
        'set "PONTE_CODIGO={}"'.format(codigo),
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; '
        "iex ((New-Object Net.WebClient).DownloadString($env:PONTE_URL + '/instalar.ps1'))\"",
        "if errorlevel 1 pause",
        "",
    ]
    return send_file(io.BytesIO("\r\n".join(linhas).encode("ascii")), mimetype="application/octet-stream",
                     as_attachment=True, download_name="instalar-ponte.bat")


@app.get("/instalar.ps1")
def instalar_ps1():
    resposta = send_from_directory(PASTA_PC, "instalar-do-zero.ps1", mimetype="text/plain")
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


@app.get("/api/instalar/pacote")
def instalar_pacote():
    """O projeto + a configuracao do papel pedido. A credencial e o codigo."""
    ip = _ip()
    if _bloqueado(ip):
        return jsonify({"erro": "muitas tentativas; espere um minuto"}), 429
    papel = request.args.get("papel", "")
    if papel not in PAPEIS:
        return jsonify({"erro": "papel desconhecido"}), 400
    codigo = request.headers.get("X-Ponte-Codigo", "")
    agora = time.time()
    with _tranca:
        registro = _codigos.get(codigo)
        valido = bool(codigo) and registro is not None and registro[0] >= agora and registro[1] > 0
        if valido:
            registro[1] -= 1
    if not valido:
        _errou(ip)
        return jsonify({"erro": "codigo de instalacao invalido ou vencido. Baixe o instalador de novo."}), 403
    cofre = _ler_cofre() or {}
    extras = {nome: base64.b64decode(conteudo)
              for nome, conteudo in (cofre.get("arquivos") or {}).items()
              if _NOME_OK.match(nome) and _do_papel(nome, papel)}
    resposta = send_file(_zip_pc(extras), mimetype="application/zip", as_attachment=True,
                         download_name="ponte-do-culto-pc.zip")
    resposta.headers["Cache-Control"] = "no-store"
    resposta.headers["X-Ponte-Cofre"] = str(len(extras))
    return resposta


if __name__ == "__main__":
    # So para teste local. Na VPS: gunicorn --workers 1 --threads 8 app:app
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8710)), threaded=True)
