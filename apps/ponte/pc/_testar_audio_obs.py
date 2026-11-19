"""Testes do nivel de audio do OBS. Rodam sem OBS:

    python _testar_audio_obs.py

So a conta e a memoria dos picos sao testadas aqui. A conexao com o OBS de
verdade (se o evento chega pela rede da igreja) so da para conferir la.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import obs_ouvinte
from ponte.obs_ouvinte import Medidor, palavra, pico_db

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


def entrada(nome, pico):
    return {"inputName": nome, "inputLevelsMul": [[pico * 0.7, pico, pico], [pico * 0.5, pico * 0.8, pico]]}


class Relogio:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t


print("\nDe numero para dB")
conferir("1.0 e 0 dB", abs(pico_db([[0.5, 1.0, 1.0]])) < 0.01)
conferir("0.1 e -20 dB", abs(pico_db([[0.0, 0.1, 0.1]]) + 20) < 0.01)
conferir("vale o canal mais alto", abs(pico_db([[0, 0.1, 0], [0, 0.5, 0]]) + 6.02) < 0.01)
conferir("silencio e -100", pico_db([[0, 0, 0]]) == -100.0)
conferir("lista vazia e -100", pico_db([]) == -100.0 and pico_db(None) == -100.0)
conferir("lixo nao estoura", pico_db([["a"], 3, None]) == -100.0)

print("\nA palavra de cada nivel")
for db, esperado in ((-61, "fechado"), (-60, "baixo"), (-31, "baixo"), (-30, "bom"), (-7, "bom"),
                     (-6, "alto"), (-2, "alto"), (-1, "estourando"), (0, "estourando")):
    conferir("{} dB e '{}'".format(db, esperado), palavra(db)[0] == esperado, palavra(db))
conferir("a barra vai de 0 a 100", palavra(-60)[2] == 0 and palavra(0)[2] == 100 and palavra(-30)[2] == 50)
conferir("fechado e cinza, bom e verde, estourando e vermelho",
         (palavra(-80)[1], palavra(-20)[1], palavra(0)[1]) == ("cinza", "verde", "vermelho"))

print("\nO pico do ultimo segundo")
r = Relogio()
m = Medidor(agora=r)
conferir("antes de qualquer evento: nada a mostrar", m.retrato() == [] and not m.vivo())
m.receber([entrada("Mesa de som", 0.6), entrada("Microfone", 0.0)])
r.t += 0.5
m.receber([entrada("Mesa de som", 0.02), entrada("Microfone", 0.0)])
ret = m.retrato()
conferir("um pico de meio segundo atras ainda vale", ret[0]["estado"] == "alto", ret[0])
conferir("entrada em silencio: fechado", ret[1]["estado"] == "fechado" and ret[1]["nivel"] == 0, ret[1])
r.t += 1.5
m.receber([entrada("Mesa de som", 0.02), entrada("Microfone", 0.0)])
conferir("dois segundos depois o pico antigo ja nao conta", m.retrato()[0]["estado"] == "baixo", m.retrato()[0])
for _ in range(200):
    r.t += 0.05
    m.receber([entrada("Mesa de som", 0.3)])
conferir("200 eventos nao acumulam memoria", len(m._picos["Mesa de som"]) <= 6, len(m._picos["Mesa de som"]))
r.t += 4
conferir("sem evento ha 4 s: as barras somem", m.retrato() == [] and not m.vivo())

print("\nNomes e entradas")
r = Relogio()
m = Medidor(agora=r)
m.receber([entrada("Mix/Aux", 0.3), entrada("Mic", 0.3), entrada("C", 0.1), entrada("D", 0.1), entrada("E", 0.1)])
conferir("sem lista no config: as quatro primeiras, com o nome do OBS",
         [x["nome"] for x in m.retrato()] == ["Mix/Aux", "Mic", "C", "D"])
conf = [{"entrada": "Mix/Aux", "nome": "Som do louvor"}, {"entrada": "Mic", "nome": "Microfone", "palavra": True},
        {"entrada": "Nao existe", "nome": "Sobrando"}]
ret = m.retrato(conf)
conferir("o config troca o rotulo", [x["nome"] for x in ret] == ["Som do louvor", "Microfone", "Sobrando"])
conferir("a entrada da palavra vem marcada", ret[1]["palavra"] is True and ret[0]["palavra"] is False)
conferir("entrada que o OBS nao tem: avisa, sem estourar", ret[2]["estado"] == "não achei no OBS", ret[2])
m.receber("isso nao e lista")
m.receber([None, {"semNome": 1}, {"inputName": "X", "inputLevelsMul": "torto"}])
conferir("evento malformado nao estoura", m.retrato(conf)[0]["estado"] == "bom")
conferir("o ouvinte so se inscreve no nivel de audio", obs_ouvinte.INPUT_VOLUME_METERS == 65536)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
