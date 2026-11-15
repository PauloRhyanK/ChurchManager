"""Da pra DIRIGIR o Holyrics de fora, em tempo real?

A arquitetura descrita e: uma plataforma externa onde o ministro monta e muda
o repertorio, inclusive durante o ensaio e o culto, e o sistema da igreja
segue. Isso exige que a ordem das musicas e a navegacao sejam controlaveis
de fora, ao vivo.

Testa so DISPONIBILIDADE, com ids inexistentes e leituras. Nao altera o
repertorio de verdade.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

import yaml

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["holyrics"]
BASE = "http://{}:{}/api/".format(cfg["host"], cfg["porta"])
TOKEN = urllib.parse.urlencode({"token": str(cfg["token"])})
FALSO = "999999999999"


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


def situacao(corpo):
    if corpo.get("status") == "ok":
        return "LIVRE", ""
    texto = str(corpo.get("error") or "")
    b = texto.lower()
    if "assinatura" in b or "subscription" in b:
        return "PAGO", ""
    if "acesso negado" in b:
        return "permissao", texto[:40]
    if "unauthorized" in b:
        return "sem permissao", ""
    return "LIVRE", texto[:46]


GRUPOS = [
    ("REPERTORIO EM TEMPO REAL", [
        ("GetLyricsPlaylist", None),
        ("AddLyricsToPlaylist", {"id": FALSO}),
        ("RemoveFromLyricsPlaylist", {"id": FALSO}),
        ("SetLyricsPlaylistItem", {"id": FALSO}),
        ("GetMediaPlaylist", None),
        ("AddToPlaylist", {"items": []}),
        ("MediaPlaylistAction", {"id": FALSO}),
        ("GetNextSongPlaylist", None),
        ("ShowNextSongPlaylist", None),
    ]),
    ("HOLYRICS COMO RENDERIZADOR BURRO", [
        ("ShowQuickPresentation", {"slides": []}),
        ("ShowLyrics", {"id": FALSO}),
        ("ActionGoToIndex", {"index": 0}),
        ("ActionGoToSlideDescription", {"name": "x"}),
        ("GetSlideDescriptions", None),
    ]),
    ("COISAS DE MUSICO", [
        ("GetRealTimeSongKey", None),
        ("SetRealTimeSongKey", {"key": "C"}),
        ("GetBpm", None),
        ("SetBpm", {"bpm": 0}),
    ]),
    ("ESCALA E VOLUNTARIOS", [
        ("GetTeams", None),
        ("GetMembers", None),
        ("GetRoles", None),
        ("GetServices", None),
        ("GetEvents", None),
        ("CreateEvent", None),
        ("GetSchedules", None),
        ("SetCurrentSchedule", {"id": FALSO}),
    ]),
    ("GATILHOS DO PROPRIO HOLYRICS", [
        ("GetRuleGroupList", None),
        ("GetScheduledTasks", None),
        ("GetTriggerPauseStateForReceiver", None),
        ("RunActions", {"action_id": FALSO}),
    ]),
]

for titulo, acoes in GRUPOS:
    print("\n=== {} ===".format(titulo))
    for acao, payload in acoes:
        estado, detalhe = situacao(chamar(acao, payload))
        print("  {:<30} {:<14} {}".format(acao, estado, detalhe))

print("\n=== quanto repertorio ha agora ===")
playlist = chamar("GetLyricsPlaylist").get("data")
print("  itens na playlist de musicas:",
      len(playlist) if isinstance(playlist, list) else playlist)
