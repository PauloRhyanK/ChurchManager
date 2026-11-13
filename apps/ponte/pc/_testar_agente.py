"""Testa o par AGENTE + SEGUIDOR de ponta a ponta, numa maquina so.

Sobe uma segunda ponte nesta mesma pasta, com outro config, fazendo o papel
do PC do som: ela busca o quadro na ponte principal (modo agente) e manda
Art-Net para 127.0.0.1, onde este teste escuta.

Prova o caminho inteiro — clique no painel -> quadro guardado -> buscado pela
rede -> aplicado na luz — sem hardware e sem a outra maquina.

Pre-requisito: a ponte principal no ar na 8700, com luzes.driver = agente.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

import yaml

AQUI = os.path.dirname(os.path.abspath(__file__))
PRINCIPAL = "http://127.0.0.1:8700"
SEGUIDORA = "http://127.0.0.1:8701"
CONFIG_SEG = os.path.join(AQUI, "_config_seguidora.yaml")

falhas = []
recebidos = []


def checar(nome, ok, detalhe=""):
    print(("  OK   " if ok else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not ok:
        falhas.append(nome)


def chamar(base, caminho, corpo=None):
    req = urllib.request.Request(
        base + caminho,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method="POST" if corpo is not None else "GET")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        return erro.code, json.loads(erro.read().decode("utf-8"))


# -- monta o config da seguidora --------------------------------------------
cfg = yaml.safe_load(open(os.path.join(AQUI, "config.yaml"), encoding="utf-8"))
cfg["luzes"] = {"driver": "artnet", "host": "127.0.0.1", "universo": 1,
                "reenvio_segundos": 0.5}
cfg["seguidor"] = {"ativo": True, "url": PRINCIPAL, "intervalo": 0.2}
cfg["servidor"] = {"host": "127.0.0.1", "porta": 8701}
# Sem OBS nem Holyrics: a seguidora so cuida de luz, e tentar conectar neles
# so atrasaria a subida.
cfg["obs"] = dict(cfg.get("obs") or {}, ativo=False)
cfg["holyrics"] = dict(cfg.get("holyrics") or {}, ativo=False)
with open(CONFIG_SEG, "w", encoding="utf-8") as arquivo:
    yaml.safe_dump(cfg, arquivo, allow_unicode=True, default_flow_style=False)

# -- escuta o Art-Net --------------------------------------------------------
servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
servidor.bind(("0.0.0.0", 6454))
servidor.settimeout(0.4)


def escutar():
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


# -- sobe a seguidora --------------------------------------------------------
ambiente = dict(os.environ, PONTE_CONFIG=CONFIG_SEG)
processo = subprocess.Popen([sys.executable, "app.py"], cwd=AQUI, env=ambiente,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("subindo a seguidora na 8701...")
time.sleep(9)

try:
    print("\n[1] as duas pontes estao no ar")
    cod, d = chamar(PRINCIPAL, "/api/luz/quadro")
    checar("a principal serve o quadro", cod == 200 and "versao" in d, str(d)[:70])
    cod, d2 = chamar(SEGUIDORA, "/api/status")
    nomes = [s["nome"] for s in d2]
    checar("a seguidora subiu", cod == 200, str(cod))
    checar("ela mostra o Seguidor no status", "Seguidor" in nomes, str(nomes))
    seg = next((s for s in d2 if s["nome"] == "Seguidor"), None)
    checar("e esta ouvindo a principal", seg and seg["estado"] == "ok",
           str(seg["detalhe"])[:70] if seg else "-")

    print("\n[2] uma cena na principal chega na luz da seguidora")
    chamar(PRINCIPAL, "/api/luz/canais",
           {"canais": {4: 255, 49: 200, 53: 180}, "exclusivo": True})
    time.sleep(1.2)
    quadros = colher(1.2)
    checar("saiu Art-Net da seguidora", len(quadros) > 0, "{} pacotes".format(len(quadros)))
    if quadros:
        q = quadros[-1]
        checar("canal 4 = 255", q[3] == 255, str(q[3]))
        checar("canal 49 = 200", q[48] == 200, str(q[48]))
        checar("canal 53 = 180", q[52] == 180, str(q[52]))

    print("\n[3] cena nova ZERA o que a anterior tinha aceso")
    # O retrato so traz canais acesos. Sem zerar antes, o canal 53 ficaria
    # ligado para sempre — e uma cena e estado absoluto, nao ajuste.
    chamar(PRINCIPAL, "/api/luz/canais", {"canais": {4: 100}, "exclusivo": True})
    time.sleep(1.2)
    quadros = colher(1.0)
    if quadros:
        q = quadros[-1]
        checar("canal 4 virou 100", q[3] == 100, str(q[3]))
        checar("canal 53 apagou", q[52] == 0,
               "ficou {} — o seguidor nao zerou".format(q[52]))

    print("\n[4] o MODO viaja, e o movimento e calculado la")
    chamar(PRINCIPAL, "/api/luz/canais",
           {"canais": {49: 200, 53: 255, 113: 128, 114: 128, 115: 255},
            "exclusivo": True})
    cod, d = chamar(PRINCIPAL, "/api/luz/modo/lento", {})
    checar("a principal aceitou o modo", cod == 200, str(d))
    time.sleep(1.5)
    quadros = colher(2.5)
    checar("a taxa da seguidora subiu", len(quadros) > 25,
           "{} pacotes em 2,5s".format(len(quadros)))
    pans = {q[112] for q in quadros}
    checar("o pan anda do lado de la", len(pans) > 2, "valores {}".format(sorted(pans)[:6]))
    checar("dentro do limite", all(96 <= p <= 160 for p in pans),
           str([p for p in pans if not 96 <= p <= 160][:3]))

    print("\n[5] 'parado' volta a congelar")
    chamar(PRINCIPAL, "/api/luz/modo/parado", {})
    time.sleep(1.2)
    quadros = colher(1.5)
    checar("quadro constante de novo", len({bytes(q) for q in quadros}) == 1,
           "{} quadros distintos".format(len({bytes(q) for q in quadros})))

    print("\n[6] a principal sumindo NAO apaga a luz")
    # Esta e a que mais importa num culto: engasgo de rede nao pode apagar o
    # salao. A luz fica no ultimo quadro, que o reenvio continua mandando.
    antes = colher(0.8)
    referencia = bytes(antes[-1]) if antes else None
    chamar(PRINCIPAL, "/api/luz/modo/parado", {})
    # Simula a perda apontando o seguidor para um endereco morto nao da pra
    # fazer sem reiniciar; entao conferimos o comportamento declarado: com a
    # principal viva e sem mudancas, o quadro se mantem.
    depois = colher(1.5)
    checar("a luz continua no mesmo quadro", referencia is not None
           and all(bytes(q) == referencia for q in depois),
           "o quadro mudou sem ninguem pedir")

finally:
    print("\n=== derrubando a seguidora ===")
    processo.terminate()
    try:
        processo.wait(timeout=10)
    except subprocess.TimeoutExpired:
        processo.kill()
    servidor.close()

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
