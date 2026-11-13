"""Testa o painel de comunicacao do Holyrics — o recado que o palco ve.

CUIDADO DELIBERADO: le o estado atual ANTES, testa, e restaura exatamente o
que estava. O painel de comunicacao e uma tela que gente de verdade olha; nao
e lugar de deixar lixo de teste.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml

cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))["holyrics"]
host = str(cfg["host"])
if ":" in host and not host.startswith("["):
    host = "[{}]".format(host)
BASE = "http://{}:{}/api/".format(host, cfg["porta"])
TOKEN = urllib.parse.urlencode({"token": str(cfg["token"])})


def chamar(acao, payload=None):
    req = urllib.request.Request(BASE + acao + "?" + TOKEN,
                                 data=json.dumps(payload or {}).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except ValueError:
            return {"status": "error", "error": "HTTP {}".format(e.code)}
    except Exception as e:
        return {"status": "error", "error": str(e)[:70]}


print("=== estado ANTES (vou restaurar isto no fim) ===")
antes = chamar("GetCommunicationPanelInfo").get("data") or {}
texto_antes = antes.get("text") or ""
mostrando_antes = bool(antes.get("show"))
print("  texto   : {} caracteres".format(len(texto_antes)))
print("  exibindo: {}".format(mostrando_antes))

print("\n=== mandando um recado de teste ===")
r = chamar("SetTextCommunicationPanel",
           {"text": "TESTE DA PONTE - pode ignorar", "show": True})
print("  SetTextCommunicationPanel ->", json.dumps(r, ensure_ascii=False)[:100])
time.sleep(1)

depois = chamar("GetCommunicationPanelInfo").get("data") or {}
print("  confirmando: exibindo={} texto={!r}".format(
    depois.get("show"), (depois.get("text") or "")[:40]))
funcionou = (depois.get("text") or "").startswith("TESTE DA PONTE")

print("\n=== testando o alerta (tela do publico) ===")
alerta_antes = chamar("GetAlert").get("data") or {}
print("  alerta antes: {}".format(json.dumps(alerta_antes, ensure_ascii=False)[:80]))
ra = chamar("SetAlert", {"show": False, "text": ""})
print("  SetAlert (sem exibir) ->", json.dumps(ra, ensure_ascii=False)[:80])

print("\n=== RESTAURANDO o que estava ===")
rr = chamar("SetTextCommunicationPanel", {"text": texto_antes, "show": mostrando_antes})
print("  restaurado ->", json.dumps(rr, ensure_ascii=False)[:80])
time.sleep(1)
final = chamar("GetCommunicationPanelInfo").get("data") or {}
igual = ((final.get("text") or "") == texto_antes
         and bool(final.get("show")) == mostrando_antes)
print("  voltou exatamente como estava: {}".format(igual))

print("\n" + "-" * 56)
print("  SetTextCommunicationPanel funciona: {}".format(funcionou))
print("  estado restaurado: {}".format(igual))
