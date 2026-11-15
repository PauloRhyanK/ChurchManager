"""Confirma o codigo 500 (OutputRunning) esperando a saida ficar ATIVA.

A tentativa anterior falhou por corrida, nao por codigo errado: StartVirtualCam
devolve na hora, mas a camera leva um instante para ficar ativa. Chamar de novo
nesse intervalo nao da 500 porque ainda nao esta rodando — e pior, meu
finally parou cedo demais e deixou a camera ligada.

Agora: liga, ESPERA ficar ativa de verdade, so entao testa, e garante o
desligamento conferindo o estado em vez de confiar numa chamada.

A camera virtual e local: nao vai ao ar, nao grava arquivo.
"""

import time

import yaml

from ponte.cues import executar
from ponte.obs import ClienteOBS, ErroOBS

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["obs"]
c = ClienteOBS(cfg["host"], cfg["porta"], cfg["senha"], timeout=8)

falhas = []


def checar(nome, ok, detalhe=""):
    print(("  OK   " if ok else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not ok:
        falhas.append(nome)


def virtual_ativa():
    return bool(c.pedir("GetVirtualCamStatus")["outputActive"])


def esperar_ate(desejado, segundos=6.0):
    limite = time.time() + segundos
    while time.time() < limite:
        if virtual_ativa() == desejado:
            return True
        time.sleep(0.3)
    return virtual_ativa() == desejado


print("=== saidas antes ===")
gravando = c.pedir("GetRecordStatus")["outputActive"]
transmitindo = c.pedir("GetStreamStatus")["outputActive"]
antes = virtual_ativa()
print("  gravando={}  transmitindo={}  camera virtual={}".format(
    gravando, transmitindo, antes))

if gravando or transmitindo:
    print("\n  TEM SAIDA ATIVA. Abortando sem tocar em nada.")
    raise SystemExit(1)
if antes:
    print("\n  A camera virtual ja esta ligada. Nao mexo no que esta em uso.")
    raise SystemExit(1)


print("\n[1] 501 — parar o que esta parado")
try:
    c.pedir("StopVirtualCam")
    checar("levanta ErroOBS", False, "nao levantou")
except ErroOBS as erro:
    checar("codigo e 501", getattr(erro, "codigo", None) == 501,
           "veio {}".format(getattr(erro, "codigo", None)))


print("\n[2] 500 — ligar o que ja esta ligado")
try:
    c.pedir("StartVirtualCam")
    if not esperar_ate(True):
        print("  PULADO  a camera nao ficou ativa; 500 segue nao verificado")
        falhas.append("codigo 500 nao verificado")
    else:
        print("  camera ativa, agora chamando de novo")
        try:
            c.pedir("StartVirtualCam")
            checar("levanta ErroOBS", False, "nao levantou")
        except ErroOBS as erro:
            checar("codigo e 500", getattr(erro, "codigo", None) == 500,
                   "veio {}".format(getattr(erro, "codigo", None)))
            print("      mensagem: {}".format(str(erro)[:70]))

        print("\n[3] o motor de cues trata 500 como 'ok'?")
        cue = {"passos": [{"obs": {"requestType": "StartVirtualCam"}}]}
        res = executar(cue, {"obs": c, "luzes": None, "looks": {}})
        checar("passo vira 'ok', nao 'erro'", res[0]["estado"] == "ok",
               res[0]["detalhe"])
        checar("detalhe diz que ja estava", "ja estava" in res[0]["detalhe"],
               res[0]["detalhe"])
finally:
    print("\n=== desligando a camera virtual ===")
    try:
        c.pedir("StopVirtualCam")
    except ErroOBS:
        pass
    voltou = esperar_ate(False)
    checar("camera virtual desligada de volta", voltou,
           "ainda ativa!" if not voltou else "")

g = c.pedir("GetRecordStatus")["outputActive"]
t = c.pedir("GetStreamStatus")["outputActive"]
checar("gravacao e transmissao intocadas", g == gravando and t == transmitindo)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
