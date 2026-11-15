"""Testa o passo obs_fonte contra o OBS real SEM mudar nada no ar.

Truque: le a visibilidade atual de cada fonte e regrava o MESMO valor. Isso
percorre GetSceneItemId + SetSceneItemEnabled de verdade, prova que o caminho
funciona, e o que esta na tela continua exatamente como estava.

Tambem testa o caminho de erro, que e onde moram as surpresas.
"""

import yaml

from ponte.cues import executar
from ponte.obs import ClienteOBS, ErroOBS

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["obs"]
c = ClienteOBS(cfg["host"], cfg["porta"], cfg["senha"], timeout=8)

CENA = "Ao vivo"
falhas = []


def checar(nome, ok, detalhe=""):
    print(("  OK   " if ok else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not ok:
        falhas.append(nome)


print("\n[1] estado atual de '{}'".format(CENA))
itens = c.pedir("GetSceneItemList", {"sceneName": CENA})["sceneItems"]
antes = {i["sourceName"]: i["sceneItemEnabled"] for i in itens}
for nome, visivel in antes.items():
    print("   {:<24} {}".format(nome, "visivel" if visivel else "oculto"))


print("\n[2] regravando cada fonte com o MESMO valor (nao muda nada)")
for nome, visivel in antes.items():
    try:
        c.definir_visibilidade(CENA, nome, visivel)
        checar("regravou '{}'".format(nome), True)
    except ErroOBS as erro:
        checar("regravou '{}'".format(nome), False, str(erro))


print("\n[3] nada mudou de verdade?")
depois = {i["sourceName"]: i["sceneItemEnabled"]
          for i in c.pedir("GetSceneItemList", {"sceneName": CENA})["sceneItems"]}
checar("estado identico ao do inicio", antes == depois,
       "" if antes == depois else str({k: (antes[k], depois.get(k)) for k in antes
                                       if antes[k] != depois.get(k)}))


print("\n[4] fonte que nao existe da erro claro")
try:
    c.definir_visibilidade(CENA, "FonteQueNaoExiste_zzz", True)
    checar("levanta ErroOBS", False, "nao levantou nada")
except ErroOBS as erro:
    checar("levanta ErroOBS", True)
    checar("mensagem cita a fonte e a cena",
           "FonteQueNaoExiste_zzz" in str(erro) and CENA in str(erro), str(erro)[:90])


print("\n[5] cena que nao existe da erro claro")
try:
    c.definir_visibilidade("CenaQueNaoExiste_zzz", "Blackmagic - Camera", True)
    checar("levanta ErroOBS", False, "nao levantou nada")
except ErroOBS as erro:
    checar("levanta ErroOBS", True, str(erro)[:90])


print("\n[6] passo obs_fonte com erro nao derruba a cue")
cue = {"passos": [
    {"obs_fonte": {"cena": CENA, "fonte": "NaoExiste_zzz", "visivel": True}},
    {"esperar": 0.05},
]}
res = executar(cue, {"obs": c, "luzes": None, "looks": {}})
checar("passo vira erro", res[0]["estado"] == "erro", res[0]["detalhe"][:70])
checar("passo seguinte roda", res[1]["estado"] == "ok")

cue_ruim = {"passos": [{"obs_fonte": {"cena": CENA}}]}
res2 = executar(cue_ruim, {"obs": c, "luzes": None, "looks": {}})
checar("falta de 'fonte' vira erro", res2[0]["estado"] == "erro", res2[0]["detalhe"])


print("\n" + "-" * 60)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
print("O que estava no ar continua exatamente como estava.")
