"""Testes do relogio da musica. Rodam sem nada ligado:

    python _testar_relogio.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte.relogio import Relogio

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


class Tempo:
    def __init__(self):
        self.t = 50.0

    def __call__(self):
        return self.t


print("\nFonte que avisa (navegador, reaper)")
t = Tempo()
r = Relogio("navegador", agora=t)
conferir("antes de qualquer aviso: sem sinal, sem posicao",
         r.ler() == {"fonte": "navegador", "musica": None, "posicao": None, "tocando": False, "sinal": False})
conferir("aviso da fonte escolhida e aceito", r.avisar("navegador", "avante", 10.0, True))
t.t += 0.5
conferir("anda sozinho entre um aviso e outro", r.ler()["posicao"] == 10.5 and r.ler()["tocando"], r.ler())
r.avisar("navegador", "avante", 12.0, False)
t.t += 1.0
conferir("pausado nao anda", r.ler()["posicao"] == 12.0 and not r.ler()["tocando"] and r.ler()["sinal"], r.ler())
r.avisar("navegador", "avante", 40.0, True)
r.avisar("navegador", "avante", 8.0, True)
conferir("salto para tras e so outra posicao", r.ler()["posicao"] == 8.0)
t.t += 2.9
conferir("2,9 s sem aviso: ainda tem sinal", r.ler()["sinal"] and abs(r.ler()["posicao"] - 10.9) < 0.001, r.ler())
t.t += 5.0
leitura = r.ler()
conferir("mais de 3 s sem aviso: sem sinal", leitura["sinal"] is False and leitura["tocando"] is False, leitura)
conferir("e a posicao para, em vez de correr sozinha", leitura["posicao"] == 11.0, leitura)
conferir("aviso de outra fonte e ignorado", r.avisar("reaper", "avante", 99.0, True) is False and r.ler()["posicao"] == 11.0)
conferir("posicao torta e recusada", r.avisar("navegador", "x", "abc", True) is False
         and r.avisar("navegador", "x", -3, True) is False and r.avisar("navegador", "x", float("nan"), True) is False)
conferir("a fonte navegador nao tem 'Comecou'", r.comecar("avante") is False and r.acertar(1) is False)
r.parar()
conferir("parar zera", r.ler()["posicao"] is None and r.ler()["musica"] is None)
conferir("fonte desconhecida no config vira navegador", Relogio("pandeiro").fonte == "navegador")

print("\nReaper: mesma rota, outra fonte")
t = Tempo()
r = Relogio("reaper", agora=t)
conferir("aceita o aviso do reaper", r.avisar("reaper", "sou_grato", 30.0, True))
conferir("e recusa o do navegador", r.avisar("navegador", "sou_grato", 5.0, True) is False)
t.t += 0.25
conferir("anda igual", r.ler() == {"fonte": "reaper", "musica": "sou_grato", "posicao": 30.25, "tocando": True, "sinal": True}, r.ler())

print("\nCronometro")
t = Tempo()
r = Relogio("cronometro", agora=t)
conferir("antes do 'Comecou': sem sinal", r.ler()["sinal"] is False)
conferir("'Comecou' comeca do zero", r.comecar("avante") and r.ler()["posicao"] == 0.0 and r.ler()["tocando"])
t.t += 10
r.acertar(0.5)
conferir("acertar +0,5 s", r.ler()["posicao"] == 10.5, r.ler())
r.acertar(-100)
conferir("acertar nao vai abaixo de zero", r.ler()["posicao"] == 0.0)
t.t += 600
conferir("nunca perde o sinal por falta de aviso", r.ler()["sinal"] and r.ler()["posicao"] == 600.0, r.ler())
conferir("nao aceita aviso de ninguem", r.avisar("cronometro", "avante", 3, True) is False)

print("\nAdiantar a letra")
t = Tempo()
r = Relogio("navegador", adiantar_ms=300, agora=t)
r.avisar("navegador", "avante", 10.0, True)
conferir("adiantar_ms soma na posicao", r.ler()["posicao"] == 10.3, r.ler())
conferir("adiantar_ms torto vira zero", Relogio("navegador", adiantar_ms="x")._adiantar == 0.0)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
