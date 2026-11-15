"""O Holyrics aceita RECEBER musica por API, ou so entregar?

Essa e a pergunta que decide se "sincronizar o acervo com um repositorio
externo" precisa de outro programa ou nao.

CUIDADO DELIBERADO: este script NAO cria nada. O acervo tem 625 musicas de
verdade e nao e lugar de experimento. Para saber se uma acao de escrita
existe, ele chama com um id que nao existe. Se a acao existir, o Holyrics
reclama do id — e reclamar do id ja prova que a acao esta la.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

import yaml

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["holyrics"]
BASE = "http://{}:{}/api/".format(cfg["host"], cfg["porta"])
TOKEN = urllib.parse.urlencode({"token": str(cfg["token"])})


def chamar(acao, payload=None):
    req = urllib.request.Request(BASE + acao + "?" + TOKEN,
                                 data=json.dumps(payload or {}).encode(),
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        try:
            return erro.code, json.loads(erro.read().decode("utf-8"))
        except ValueError:
            return erro.code, {}
    except Exception as erro:
        return None, {"erro": str(erro)[:80]}


def resumo(corpo):
    if not isinstance(corpo, dict):
        return str(corpo)[:70]
    if corpo.get("status") == "ok":
        return "OK"
    return str(corpo.get("error") or corpo)[:70]


ID_FALSO = "id_que_nao_existe_zzz999"

print("=== acoes de escrita: existem? ===")
print("(chamadas com id inexistente — nao criam nada)\n")
for acao, payload in [
    ("EditLyrics", {"id": ID_FALSO}),
    ("CreateLyrics", None),
    ("DeleteLyrics", {"id": ID_FALSO}),
    ("CreateSongGroup", None),
    ("AddSongsToSongGroup", {"id": ID_FALSO}),
    ("AddLyricsToPlaylist", {"id": ID_FALSO}),
    ("CreateText", None),
    ("CreateItem", None),
    ("EditItem", {"id": ID_FALSO}),
    ("SetCurrentSchedule", {"id": ID_FALSO}),
    ("LoadSavedPlaylist", {"id": ID_FALSO}),
]:
    codigo, corpo = chamar(acao, payload)
    marca = resumo(corpo)
    # "unauthorized action" = nao liberada. Qualquer reclamacao de CAMPO
    # significa que a acao existe e o Holyrics chegou a validar o pedido.
    if "unauthorized" in marca:
        veredito = "nao liberada pro token"
    elif "not found" in marca and "field" not in marca:
        veredito = "acao nao existe"
    else:
        veredito = "EXISTE"
    print("  {:<24} {:<10} {:<46} {}".format(acao, str(codigo), marca, veredito))

print("\n=== o que da pra usar pra sincronizar sem reenviar tudo ===")
musicas = chamar("GetSongs")[1]["data"]
print("  musicas:", len(musicas))
amostra = musicas[0]
print("  metadata da primeira:", json.dumps(amostra.get("metadata"), ensure_ascii=False)[:160])
print("  tags:", json.dumps(amostra.get("tags"), ensure_ascii=False)[:80])
print("  extras:", json.dumps(amostra.get("extras"), ensure_ascii=False)[:120])

com_meta = sum(1 for m in musicas if m.get("metadata"))
print("  quantas tem metadata preenchida:", com_meta, "de", len(musicas))
