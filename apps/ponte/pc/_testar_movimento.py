"""Testa os modos de movimento ao vivo, contra um receptor Art-Net local.

Prova a coisa que o teste offline nao alcanca: que o quadro que SAI PELO FIO
realmente muda sozinho com o modo ligado, e que para de mudar com ele
desligado. Nao precisa de hardware.

Pre-requisito: a ponte no ar, com luzes driver=artnet.
"""

import json
import socket
import threading
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8700"
falhas = []
recebidos = []


def checar(nome, ok, detalhe=""):
    print(("  OK   " if ok else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not ok:
        falhas.append(nome)


def chamar(caminho, corpo=None):
    req = urllib.request.Request(
        BASE + caminho,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method="POST" if corpo is not None else "GET")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        return erro.code, json.loads(erro.read().decode("utf-8"))


servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
servidor.bind(("0.0.0.0", 6454))
servidor.settimeout(0.4)


def escutar():
    """Precisa tratar o timeout e continuar. A primeira versao disto era uma
    lambda com list comprehension, e ela MORREU no primeiro timeout — o teste
    colheu zero pacotes e reprovou codigo que estava certo."""
    while True:
        try:
            recebidos.append(servidor.recvfrom(1024)[0])
        except socket.timeout:
            continue
        except OSError:
            return


threading.Thread(target=escutar, daemon=True).start()


def colher(segundos):
    recebidos.clear()
    time.sleep(segundos)
    return [p[18:] for p in list(recebidos)]


print("[1] o catalogo chega ao painel")
cod, d = chamar("/api/luz/mesa")
modos = d.get("modos") or []
checar("tem modos", len(modos) >= 5, "{} modos".format(len(modos)))
checar("vem ordenado por energia",
       [m["energia"] for m in modos] == sorted(m["energia"] for m in modos))
checar("o estrobo vem marcado", any(m["perigoso"] for m in modos),
       str([m["id"] for m in modos if m["perigoso"]]))

print("\n[2] cena acesa, modo parado: o quadro NAO muda")
chamar("/api/luz/canais", {"canais": {49: 200, 53: 255, 113: 128, 114: 128, 115: 255},
                           "exclusivo": True})
chamar("/api/luz/modo/parado", {})
quadros = colher(2.2)
checar("chegaram pacotes", len(quadros) >= 2, "{} pacotes".format(len(quadros)))
checar("todos identicos", len({bytes(q) for q in quadros}) == 1,
       "{} quadros diferentes".format(len({bytes(q) for q in quadros})))
parado = bytes(quadros[-1]) if quadros else b""

print("\n[3] modo 'lento': o quadro passa a mudar sozinho")
cod, d = chamar("/api/luz/modo/lento", {})
checar("aceitou o modo", cod == 200 and d.get("modo") == "lento", str(d))
quadros = colher(2.5)
checar("a taxa subiu", len(quadros) > 30, "{} pacotes em 2,5s".format(len(quadros)))
checar("o quadro varia", len({bytes(q) for q in quadros}) > 5,
       "{} quadros distintos".format(len({bytes(q) for q in quadros})))
pans = {q[112] for q in quadros}
checar("o pan da cabeca anda", len(pans) > 3, "valores: {}".format(sorted(pans)[:6]))
checar("o pan fica dentro do limite", all(96 <= p <= 160 for p in pans),
       "fora: {}".format([p for p in pans if not 96 <= p <= 160][:4]))

print("\n[4] a luz de frente nunca se mexe")
chamar("/api/luz/canais", {"canais": {1: 0, 2: 0, 3: 0, 4: 255, 49: 200, 53: 255,
                                      113: 128, 114: 128, 115: 255}, "exclusivo": True})
chamar("/api/luz/modo/celebracao", {})
quadros = colher(2.5)
checar("o branco de frente fica firme", all(q[3] == 255 for q in quadros),
       "variou: {}".format(sorted({q[3] for q in quadros})[:5]))

print("\n[5] 'parado' devolve a cena exata, na hora")
chamar("/api/luz/modo/parado", {})
time.sleep(0.3)
quadros = colher(1.5)
checar("voltou a ficar constante", len({bytes(q) for q in quadros}) == 1)
if quadros:
    q = quadros[-1]
    checar("a cena esta intacta",
           q[48] == 200 and q[52] == 255 and q[112] == 128 and q[113] == 128,
           "C1={} R={} pan={} tilt={}".format(q[48], q[52], q[112], q[113]))

print("\n[6] modo que nao existe e recusado")
cod, d = chamar("/api/luz/modo/invencao", {})
checar("devolve 404", cod == 404, str(cod))

print("\n[7] nenhuma cue do culto pode escolher modo")
cod, d = chamar("/api/cues")
cs = d["cues"] if isinstance(d, dict) else d
texto = json.dumps(cs)
checar("as cues nao mencionam modo", "modo" not in texto.lower())

chamar("/api/luz/apagar", {})
chamar("/api/luz/modo/parado", {})
servidor.close()

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
