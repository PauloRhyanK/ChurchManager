"""Testa a ordem de culto contra o equipamento real, e restaura tudo.

Mexe no PREVIEW do OBS (nao no programa — modo estudio esta ligado), na
visibilidade da fonte de letras, e no F10 do Holyrics. Captura os tres antes e
devolve no fim. Nao toca em gravacao nem transmissao, e NAO dispara o momento
"encerrar", que para gravacao e apaga o telao.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

import yaml

from ponte.obs import ClienteOBS, ErroOBS

BASE = "http://127.0.0.1:8700"
cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))
obs = ClienteOBS(cfg["obs"]["host"], cfg["obs"]["porta"], cfg["obs"]["senha"], timeout=8)

h = cfg["holyrics"]
hhost = str(h["host"])
if ":" in hhost and not hhost.startswith("["):
    hhost = "[{}]".format(hhost)
HOLY = "http://{}:{}/api/".format(hhost, h["porta"])
HTOK = urllib.parse.urlencode({"token": str(h["token"])})

falhas = []


def checar(nome, ok, detalhe=""):
    print(("  OK   " if ok else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not ok:
        falhas.append(nome)


def ponte(caminho, metodo="GET", corpo=None):
    req = urllib.request.Request(
        BASE + caminho,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method=metodo)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        return erro.code, json.loads(erro.read().decode("utf-8"))


def holyrics(acao, payload=None):
    req = urllib.request.Request(HOLY + acao + "?" + HTOK,
                                 data=json.dumps(payload or {}).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8")).get("data")


def letras_visivel():
    itens = obs.pedir("GetSceneItemList", {"sceneName": "2. Louvor"})["sceneItems"]
    for i in itens:
        if i["sourceName"] == "Letras - Holyrics":
            return bool(i["sceneItemEnabled"])
    return None


print("=== estado ANTES (sera restaurado) ===")
preview_antes = obs.pedir("GetSceneList").get("currentPreviewSceneName")
letras_antes = letras_visivel()
f10_antes = bool(holyrics("GetF10"))
grav_antes = obs.pedir("GetRecordStatus")["outputActive"]
tx_antes = obs.pedir("GetStreamStatus")["outputActive"]
print("  preview={}  letras={}  F10={}  gravando={}  transmitindo={}".format(
    preview_antes, letras_antes, f10_antes, grav_antes, tx_antes))

if grav_antes or tx_antes:
    print("\n  TEM SAIDA ATIVA. Abortando sem tocar em nada.")
    raise SystemExit(1)

try:
    print("\n[1] comeca do zero")
    cod, r = ponte("/api/ordem/carregar/domingo_manha", "POST")
    checar("carrega a ordem", cod == 200, str(cod))
    checar("comeca sem momento atual", r["ordem"]["atual"] is None)
    checar("o proximo e o primeiro", r["ordem"]["proximo_id"] == "pre_culto",
           str(r["ordem"]["proximo_id"]))

    print("\n[2] avancar dois momentos")
    cod, r = ponte("/api/ordem/proximo", "POST")
    checar("entrou em pre_culto", r.get("id") == "pre_culto", str(r.get("id")))
    checar("nenhum passo deu erro", r.get("tudo_ok") is True,
           str([p for p in r.get("passos", []) if p["estado"] == "erro"]))

    cod, r = ponte("/api/ordem/proximo", "POST")
    checar("entrou em abertura", r.get("id") == "abertura", str(r.get("id")))
    checar("ponteiro em 1", r["ordem"]["atual"] == 1, str(r["ordem"]["atual"]))

    print("\n[3] pular direto para a pregacao")
    cod, r = ponte("/api/ordem/ir/pregacao", "POST")
    checar("entrou em pregacao", r.get("id") == "pregacao", str(r.get("id")))
    checar("letras ficaram ocultas", letras_visivel() is False,
           "ainda visivel — delta em vez de estado completo")

    print("\n[4] entrar DUAS VEZES no mesmo momento")
    cod1, r1 = ponte("/api/ordem/ir/pregacao", "POST")
    cod2, r2 = ponte("/api/ordem/ir/pregacao", "POST")
    checar("as duas aceitas", cod1 == 200 and cod2 == 200, "{} e {}".format(cod1, cod2))
    checar("ponteiro no mesmo lugar", r1["ordem"]["atual"] == r2["ordem"]["atual"],
           "{} vs {}".format(r1["ordem"]["atual"], r2["ordem"]["atual"]))
    checar("nenhum erro na segunda", r2.get("tudo_ok") is True,
           str([p for p in r2.get("passos", []) if p["estado"] == "erro"]))

    print("\n[5] voltar um momento")
    cod, r = ponte("/api/ordem/anterior", "POST")
    checar("voltou", r["ordem"]["atual"] == 4, str(r["ordem"]["atual"]))

    print("\n[6] versao errada e recusada")
    cod, r = ponte("/api/ordem/ir/louvor", "POST", {"versao": 999})
    checar("devolve 409", cod == 409, str(cod))
    checar("diz que foi conflito", r.get("conflito") is True, str(r))

    print("\n[7] momento que nao esta na ordem")
    cod, r = ponte("/api/ordem/ir/tela_preta", "POST")
    checar("devolve 404", cod == 404, str(cod))

    print("\n[8] a ordem aparece em /api/estado")
    cod, r = ponte("/api/estado")
    checar("tem a chave ordem", "ordem" in r)
    checar("com o momento atual", r.get("ordem", {}).get("atual") == 4,
           str(r.get("ordem", {}).get("atual")))

finally:
    print("\n=== restaurando ===")
    try:
        obs.pedir("SetCurrentPreviewScene", {"sceneName": preview_antes})
        if letras_antes is not None:
            obs.definir_visibilidade("2. Louvor", "Letras - Holyrics", letras_antes)
        holyrics("SetF10", {"enable": f10_antes})
    except Exception as erro:
        print("  falha ao restaurar: {}".format(erro))

    checar("preview restaurado",
           obs.pedir("GetSceneList").get("currentPreviewSceneName") == preview_antes)
    checar("letras restauradas", letras_visivel() == letras_antes)
    checar("F10 restaurado", bool(holyrics("GetF10")) == f10_antes)
    g = obs.pedir("GetRecordStatus")["outputActive"]
    t = obs.pedir("GetStreamStatus")["outputActive"]
    checar("gravacao e transmissao intocadas", g == grav_antes and t == tx_antes)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
