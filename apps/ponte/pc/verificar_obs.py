"""Checagem do cliente de OBS contra um OBS simulado.

Sobe um servidor que fala o protocolo obs-websocket v5 na propria maquina e
joga o ClienteOBS contra ele. Nao precisa do OBS instalado.

O QUE ISSO PROVA: o formato das mensagens, o encadeamento pergunta/resposta,
a reconexao quando a conexao cai, e que um passo de OBS que falha nao derruba
o resto da cue.

O QUE ISSO NAO PROVA: que o calculo da senha bate com o do OBS de verdade.
Os dois lados aqui sao codigo meu — se eu li a especificacao errado, o erro
se cancela. So um OBS real resolve isso.

Precisa de uma dependencia extra, so pra teste:
    .venv\\Scripts\\python.exe -m pip install websockets
Rodar:
    .venv\\Scripts\\python.exe verificar_obs.py
"""

import base64
import hashlib
import json
import logging
import sys
import threading
import time

# O servidor simulado reclama no console quando derruba uma conexao de
# proposito. E ruido do teste, nao do cliente — e ruido esconde falha de
# verdade.
logging.getLogger("websockets").setLevel(logging.CRITICAL)

from ponte.cues import executar
from ponte.obs import ClienteOBS, ErroOBS

try:
    from websockets.sync.server import serve
except ImportError:
    print("\nFalta a dependencia de teste. Rode:")
    print("  .venv\\Scripts\\python.exe -m pip install websockets\n")
    sys.exit(2)

SENHA = "senha-de-teste"
SALT = "sal-fixo-do-teste"
DESAFIO = "desafio-fixo-do-teste"

PORTA_NORMAL = 45551
PORTA_QUE_CAI = 45553

falhas = []


def checar(nome, condicao, detalhe=""):
    print(("  OK   " if condicao else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not condicao:
        falhas.append(nome)


def auth_esperada(senha):
    segredo = base64.b64encode(hashlib.sha256((senha + SALT).encode()).digest()).decode()
    return base64.b64encode(hashlib.sha256((segredo + DESAFIO).encode()).digest()).decode()


def _handshake(ws):
    """Faz o lado servidor do handshake. Devolve (ok, dados_do_identify)."""
    ws.send(json.dumps({
        "op": 0,
        "d": {"rpcVersion": 1, "authentication": {"challenge": DESAFIO, "salt": SALT}},
    }))
    identify = json.loads(ws.recv())
    if identify.get("op") != 1:
        return False, {}
    d = identify.get("d") or {}
    if d.get("authentication") != auth_esperada(SENHA):
        # O OBS fecha a conexao com codigo 4009 quando a senha esta errada.
        ws.close(code=4009, reason="Authentication failed")
        return False, d
    ws.send(json.dumps({"op": 2, "d": {"negotiatedRpcVersion": 1}}))
    return True, d


identifies_vistos = []


def servidor_normal(ws):
    ok, d = _handshake(ws)
    identifies_vistos.append(d)
    if not ok:
        return
    for bruto in ws:
        msg = json.loads(bruto)
        if msg.get("op") != 6:
            continue
        pedido = msg["d"]
        tipo = pedido["requestType"]
        if tipo == "RequisicaoRuim":
            corpo = {"result": False, "code": 204, "comment": "cena nao existe"}
            dados = {}
        else:
            corpo = {"result": True, "code": 100}
            dados = {"obsVersion": "30.1.2"} if tipo == "GetVersion" else {}
        ws.send(json.dumps({"op": 7, "d": {
            "requestType": tipo, "requestId": pedido["requestId"],
            "requestStatus": corpo, "responseData": dados,
        }}))


conexoes_do_que_cai = []


def servidor_que_cai(ws):
    """Responde a primeira requisicao e derruba a conexao. Testa reconexao."""
    conexoes_do_que_cai.append(1)
    ok, _ = _handshake(ws)
    if not ok:
        return
    bruto = ws.recv()
    pedido = json.loads(bruto)["d"]
    ws.send(json.dumps({"op": 7, "d": {
        "requestType": pedido["requestType"], "requestId": pedido["requestId"],
        "requestStatus": {"result": True, "code": 100},
        "responseData": {"obsVersion": "30.1.2"},
    }}))
    ws.close()


def subir(handler, porta):
    servidor = serve(handler, "127.0.0.1", porta)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    time.sleep(0.3)
    return servidor


s1 = subir(servidor_normal, PORTA_NORMAL)
s2 = subir(servidor_que_cai, PORTA_QUE_CAI)


print("\n[1] handshake e requisicao com senha certa")
cliente = ClienteOBS("127.0.0.1", PORTA_NORMAL, SENHA)
try:
    versao = cliente.versao()
    checar("conecta e responde", versao.get("obsVersion") == "30.1.2", str(versao))
except Exception as erro:
    checar("conecta e responde", False, str(erro))

checar("pediu rpcVersion", identifies_vistos and identifies_vistos[0].get("rpcVersion") == 1)
checar("desligou os eventos (eventSubscriptions 0)",
       identifies_vistos and identifies_vistos[0].get("eventSubscriptions") == 0,
       str(identifies_vistos[0].get("eventSubscriptions")) if identifies_vistos else "")


print("\n[2] requisicao que o OBS recusa")
try:
    cliente.pedir("RequisicaoRuim")
    checar("vira ErroOBS", False, "nao levantou nada")
except ErroOBS as erro:
    checar("vira ErroOBS", True)
    checar("mensagem traz o motivo do OBS", "cena nao existe" in str(erro), str(erro))
except Exception as erro:
    checar("vira ErroOBS", False, type(erro).__name__ + ": " + erro.__str__())


print("\n[3] a conexao continua viva depois de uma recusa")
try:
    checar("proxima requisicao funciona", cliente.versao().get("obsVersion") == "30.1.2")
except Exception as erro:
    checar("proxima requisicao funciona", False, str(erro))


print("\n[4] senha errada")
errado = ClienteOBS("127.0.0.1", PORTA_NORMAL, "senha-errada")
try:
    errado.versao()
    checar("a mensagem aponta pra senha", False, "conectou com senha errada")
except ErroOBS as erro:
    # Nao basta dar erro: a mensagem tem que mandar o operador pro lugar certo.
    checar("a mensagem aponta pra senha", "senha" in str(erro).lower(), str(erro))
except Exception as erro:
    checar("a mensagem aponta pra senha", False,
           type(erro).__name__ + ": " + erro.__str__())


print("\n[5] reconexao quando a conexao cai")
caiu = ClienteOBS("127.0.0.1", PORTA_QUE_CAI, SENHA)
try:
    caiu.versao()
    checar("primeira requisicao ok", True)
except Exception as erro:
    checar("primeira requisicao ok", False, str(erro))
try:
    caiu.versao()
    checar("reconecta sozinho na seguinte", True,
           "{} conexoes abertas".format(len(conexoes_do_que_cai)))
except Exception as erro:
    checar("reconecta sozinho na seguinte", False, str(erro))


print("\n[6] OBS fora do ar nao derruba a cue")
morto = ClienteOBS("127.0.0.1", 45599, SENHA, timeout=1.0)  # ninguem escutando
cue = {"passos": [
    {"obs": {"requestType": "SetCurrentProgramScene", "requestData": {"sceneName": "X"}}},
    {"luzes": "louvor"},
    {"esperar": 0.05},
]}
res = executar(cue, {"obs": morto, "luzes": None, "looks": {"louvor": {1: 10}}})
checar("nao levanta excecao", True)
checar("passo do OBS vira erro", res[0]["estado"] == "erro", res[0]["detalhe"])
checar("os passos seguintes rodam mesmo assim",
       [r["estado"] for r in res[1:]] == ["pulado", "ok"], str([r["estado"] for r in res[1:]]))


s1.shutdown()
s2.shutdown()

print("\n" + "-" * 60)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
print("Lembrete: isto NAO prova o calculo da senha contra o OBS de verdade.")
sys.exit(1 if falhas else 0)
