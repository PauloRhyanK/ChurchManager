"""Testes da qualidade do envio. Rodam sem OBS:

    python _testar_saude_envio.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte.saude_envio import SaudeDoEnvio

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


def rodar(passos, **extra):
    """passos: [(segundo, perdidos, total, bytes)]"""
    s = SaudeDoEnvio()
    for t, perdidos, total, bytes_ in passos:
        s.ler(t, True, perdidos, total, bytes_, **extra)
    return s.retrato()


print("\nAs quatro palavras")
conferir("nada perdido: Boa", rodar([(0, 0, 0, 0), (3, 0, 90, 900000)])["palavra"] == "Boa")
conferir("0,4% perdido: Boa", rodar([(0, 0, 0, 0), (30, 4, 1000, 0)])["palavra"] == "Boa")
conferir("1% perdido: Oscilando", rodar([(0, 0, 0, 0), (30, 10, 1000, 0)])["palavra"] == "Oscilando")
conferir("5% exato: Oscilando", rodar([(0, 0, 0, 0), (30, 50, 1000, 0)])["palavra"] == "Oscilando")
conferir("10% perdido: Ruim", rodar([(0, 0, 0, 0), (30, 100, 1000, 0)])["palavra"] == "Ruim")
conferir("congestionado sem perder quadro: Oscilando",
         rodar([(0, 0, 0, 0), (3, 0, 90, 0)], congestao=0.8)["palavra"] == "Oscilando")
conferir("reconectando ganha de tudo",
         rodar([(0, 0, 0, 0), (3, 0, 90, 0)], reconectando=True)["palavra"] == "Reconectando")

print("\nJanela e contadores")
s = SaudeDoEnvio()
s.ler(0, False)
conferir("fora do ar: sem palavra", s.retrato() == {"palavra": None, "perdidos_pct": None, "kbps": None})
r = rodar([(0, 0, 0, 0), (3, 300, 90, 0)] + [(3 + 3 * i, 300, 90 + 90 * i, 0) for i in range(1, 15)])
conferir("perda antiga, fora dos 30 s, nao conta", r["palavra"] == "Boa", r)
r = rodar([(0, 500, 9000, 5000000), (3, 520, 9090, 5100000), (6, 0, 30, 10000), (9, 0, 120, 400000)])
conferir("contador que zera (a transmissao voltou) nao da negativo",
         r["palavra"] == "Boa" and r["perdidos_pct"] == 0.0 and r["kbps"] > 0, r)
r = rodar([(0, 0, 0, 0), (10, 0, 300, 5000000)])
conferir("taxa de envio pela diferenca de bytes: 4000 kbps", r["kbps"] == 4000, r["kbps"])
conferir("uma leitura so: Boa, sem numero", rodar([(0, 0, 0, 0)]) == {"palavra": "Boa", "perdidos_pct": None, "kbps": None})
s = SaudeDoEnvio()
s.ler(0, True, None, None, None, congestao="x")
conferir("valores vazios ou tortos nao estouram", s.retrato()["palavra"] == "Boa")

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
