"""Quanto da API do Holyrics esta atras de assinatura paga?

Apareceu "Esta funcionalidade esta disponivel atraves de uma assinatura
Holyrics" numa acao. Se isso cobrir boa parte do que serve pra automacao,
muda a avaliacao sobre trocar de programa — deixa de ser preferencia e vira
limite concreto.

So chama acoes de leitura, ou de escrita com id inexistente. Nao altera nada.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

import yaml

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["holyrics"]
BASE = "http://{}:{}/api/".format(cfg["host"], cfg["porta"])
TOKEN = urllib.parse.urlencode({"token": str(cfg["token"])})
FALSO = "id_inexistente_zzz999"


def chamar(acao, payload=None):
    req = urllib.request.Request(BASE + acao + "?" + TOKEN,
                                 data=json.dumps(payload or {}).encode(),
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        try:
            return json.loads(erro.read().decode("utf-8"))
        except ValueError:
            return {"error": "HTTP {}".format(erro.code)}
    except Exception as erro:
        return {"error": str(erro)[:70]}


def classificar(corpo):
    if corpo.get("status") == "ok":
        return "livre", ""
    texto = str(corpo.get("error") or "")
    baixo = texto.lower()
    if "assinatura" in baixo or "subscription" in baixo:
        return "PAGO", ""
    if "acesso negado" in baixo:
        return "permissao", texto[:52]
    if "unauthorized" in baixo:
        return "nao liberada", ""
    return "livre", texto[:52]


print("=== o plano desta instalacao ===")
plano = chamar("GetHolyricsPlanInfo")
print(" ", json.dumps(plano, ensure_ascii=False)[:400])

print("\n=== servidor de API ===")
print(" ", json.dumps(chamar("GetAPIServerInfo"), ensure_ascii=False)[:300])

# Acoes que importam para automatizar o culto e sincronizar acervo.
ALVOS = [
    # leitura basica — tem que estar livre
    ("GetSongs", None), ("GetLyrics", {"id": FALSO}), ("GetThemes", None),
    ("GetCurrentPresentation", None), ("GetSchedules", None),
    # controle de apresentacao — o coracao das cues
    ("ActionNext", None), ("ActionPrevious", None),
    ("CloseCurrentPresentation", None), ("SetF10", {"enable": False}),
    ("ShowQuickPresentation", {"text": ""}), ("ShowLyrics", {"id": FALSO}),
    ("SetAlert", {"show": False}), ("SetTextCommunicationPanel", {"text": ""}),
    ("ShowNextSongPlaylist", None),
    # escrita de acervo — o que a sincronizacao precisa
    ("CreateLyrics", None), ("EditLyrics", {"id": FALSO}),
    ("CreateSongGroup", None), ("CreateText", None),
    ("AddToPlaylist", {"id": FALSO}), ("AddLyricsToPlaylist", {"id": FALSO}),
    ("SetCurrentSchedule", {"id": FALSO}),
    # extensibilidade — "modular uma tela nova"
    ("GetScripts", None), ("GetApis", None), ("GetModules", None),
    ("GetRuleGroupList", None), ("GetScheduledTasks", None),
    ("RunActions", None), ("ScriptAction", {"id": FALSO}),
    ("ApiAction", {"id": FALSO}), ("ModuleAction", {"id": FALSO}),
]

print("\n{:<30} {:<14} {}".format("ACAO", "SITUACAO", "detalhe"))
print("-" * 92)
contagem = {}
for acao, payload in ALVOS:
    situacao, detalhe = classificar(chamar(acao, payload))
    contagem[situacao] = contagem.get(situacao, 0) + 1
    print("{:<30} {:<14} {}".format(acao, situacao, detalhe))

print("-" * 92)
print("resumo:", ", ".join("{} {}".format(v, k) for k, v in sorted(contagem.items())))
