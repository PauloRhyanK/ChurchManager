"""Testa a mesa de teste de luz contra um receptor Art-Net local.

Nao precisa de hardware: escuta na 127.0.0.1:6454 e confere o que a ponte
manda de verdade. Nao sai nada pela rede.

Pre-requisito: a ponte no ar com luzes driver=artnet host=127.0.0.1.
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


def chamar(caminho, corpo=None, metodo=None):
    req = urllib.request.Request(
        BASE + caminho,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method=metodo or ("POST" if corpo is not None else "GET"))
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        return erro.code, json.loads(erro.read().decode("utf-8"))


servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
# 0.0.0.0 e nao 127.0.0.1, de proposito: o config pode estar apontando para
# broadcast (255.255.255.255), e pacote de broadcast NAO chega num socket
# preso ao loopback. Com 127.0.0.1 o teste falhava dizendo que o canal nao
# saiu, quando na verdade ele saiu por outro caminho.
servidor.bind(("0.0.0.0", 6454))
servidor.settimeout(0.5)


def escutar():
    while True:
        try:
            recebidos.append(servidor.recvfrom(1024)[0])
        except socket.timeout:
            continue
        except OSError:
            return


threading.Thread(target=escutar, daemon=True).start()
time.sleep(0.3)


def ultimo_quadro(espera=0.8):
    time.sleep(espera)
    return recebidos[-1][18:] if recebidos else None


print("\n[1] a mesa sabe que as luzes estao ligadas")
cod, d = chamar("/api/luz/mesa")
checar("rota responde", cod == 200, str(cod))
checar("diz que esta ligado", d.get("ligado") is True, str(d.get("driver")))

print("\n[2] acender um canal")
recebidos.clear()
cod, d = chamar("/api/luz/canais", {"canais": {"5": 200}})
checar("aceita", cod == 200, str(d))
q = ultimo_quadro()
checar("canal 5 saiu em 200", q and q[4] == 200, str(q[4]) if q else "sem pacote")

print("\n[3] exclusivo apaga o resto — e o que faz a varredura funcionar")
recebidos.clear()
chamar("/api/luz/canais", {"canais": {"9": 255}, "exclusivo": True})
q = ultimo_quadro()
checar("canal 9 aceso", q and q[8] == 255, str(q[8]) if q else "-")
checar("canal 5 apagado pelo exclusivo", q and q[4] == 0,
       "veio {} — exclusivo nao zerou".format(q[4]) if q else "-")

print("\n[4] sem exclusivo, o que ja estava fica")
recebidos.clear()
chamar("/api/luz/canais", {"canais": {"3": 77}})
q = ultimo_quadro()
checar("canal 3 novo", q and q[2] == 77, str(q[2]) if q else "-")
checar("canal 9 preservado", q and q[8] == 255, str(q[8]) if q else "-")

print("\n[5] faixa invalida e recusada, e o quadro nao muda")
# "nenhum pacote saiu" deixou de ser afirmacao valida quando a ponte passou a
# REENVIAR o quadro uma vez por segundo. Pacote agora sai sempre, de
# proposito. O que precisa continuar verdade e que o quadro nao MUDOU.
antes = ultimo_quadro(0.3)
cod, d = chamar("/api/luz/canais", {"canais": {"999": 10}})
checar("devolve 400", cod == 400, str(cod))
depois = ultimo_quadro(0.6)
checar("o quadro ficou igual", antes is not None and bytes(antes) == bytes(depois),
       "o pedido invalido mexeu no quadro")

print("\n[6] apagar tudo")
recebidos.clear()
chamar("/api/luz/apagar", {})
q = ultimo_quadro()
checar("quadro inteiro em zero", q and not any(q), "sobrou {}".format(sum(q)) if q else "-")

print("\n[7] rotular canal (o patch)")
cod, d = chamar("/api/luz/patch", {"canal": 9, "rotulo": "TESTE — par frontal esquerdo"})
checar("salva", cod == 200 and d.get("salvo"), str(d))
cod, d = chamar("/api/luz/mesa")
checar("volta na leitura", d.get("patch", {}).get("9", "").startswith("TESTE"),
       str(d.get("patch", {}).get("9")))

print("\n[8] salvar preset, e ele passa a valer SEM reiniciar")
cod, d = chamar("/api/luz/look", {"nome": "_teste_mesa", "canais": {"3": 77, "9": 255}})
checar("salva", cod == 200 and d.get("salvo"), str(d))
cod, d = chamar("/api/luz/mesa")
salvas = d.get("looks_salvas", {})
checar("aparece na lista", "_teste_mesa" in salvas, str(list(salvas)))
checar("guardou os dois canais", salvas.get("_teste_mesa") == {"3": 77, "9": 255},
       str(salvas.get("_teste_mesa")))

print("\n[9] canal em ZERO entra no preset — e isto importa")
# Ja esteve ao contrario aqui, e era um bug. O quadro DMX e persistente: o
# que a look nao menciona fica como estava. Entre os canais dos refletores da
# igreja ha um de PROGRAMA AUTOMATICO e um de RESET; um valor alto preso num
# deles faz o refletor trocar de cor sozinho ou recalibrar no meio do culto,
# e a look seguinte nao conserta se nao falar do canal. Zero nao e ausencia:
# e a declaracao de que aquele canal fica apagado.
chamar("/api/luz/look", {"nome": "_teste_zero", "canais": {"1": 100, "2": 0}})
cod, d = chamar("/api/luz/mesa")
checar("o zero foi guardado junto", d["looks_salvas"].get("_teste_zero") == {"1": 100, "2": 0},
       str(d["looks_salvas"].get("_teste_zero")))

print("\n[10] preset sem nome e recusado")
cod, d = chamar("/api/luz/look", {"nome": "   ", "canais": {"1": 10}})
checar("devolve 400", cod == 400, str(cod))

print("\n[11] limpando o que o teste criou")
for nome in ("_teste_mesa", "_teste_zero"):
    cod, d = chamar("/api/luz/look/{}/remover".format(nome), {})
    checar("removeu " + nome, cod == 200, str(d))
cod, d = chamar("/api/luz/patch", {"canal": 9, "rotulo": ""})
checar("apagou o rotulo de teste", cod == 200, str(d))
cod, d = chamar("/api/luz/mesa")
checar("mesa limpa", "_teste_mesa" not in d.get("looks_salvas", {})
       and "9" not in d.get("patch", {}),
       str(list(d.get("looks_salvas", {}))) + " / " + str(list(d.get("patch", {}))))

chamar("/api/luz/apagar", {})
servidor.close()

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
