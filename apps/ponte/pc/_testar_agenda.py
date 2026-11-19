"""Testes dos horarios do culto. Rodam sem nada ligado:

    python _testar_agenda.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import agenda

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


def hoje(hora, minuto, segundo=0):
    h = time.localtime()
    return time.mktime((h.tm_year, h.tm_mon, h.tm_mday, hora, minuto, segundo, 0, 0, -1))


ORDEM = ["pre_culto", "abertura", "louvor", "avisos", "ofertorio", "pregacao", "encerrar"]


def momentos(ids=ORDEM, cues=None):
    saida = []
    for i in ids:
        minutos, antes = agenda.minutos_de(i, (cues or {}).get(i))
        saida.append({"id": i, "minutos": minutos, "antes": antes})
    return saida


print("\nHorarios planejados")
r = agenda.calcular("19:00", momentos(), None, {}, hoje(18, 30))
horas = [m["hora"] for m in r["momentos"]]
conferir("as horas do culto padrao", horas == ["18:45", "19:00", "19:05", "19:22", "19:27", "19:32", "20:12"], horas)
conferir("antes do pre-culto: 'Começa em 15 min'", r["texto"] == "Começa em 15 min" and r["estado"] == "antes", r["texto"])

print("\nAtraso")
r = agenda.calcular("19:00", momentos(), 2, {"louvor": hoje(19, 7)}, hoje(19, 8))
conferir("entrou no louvor as 19:07: 2 min atrasado", r["atraso_s"] == 120 and r["texto"] == "2 min atrasado", r)
conferir("faltam 16 minutos do louvor", r["momentos"][2]["resta_s"] == 16 * 60, r["momentos"][2])
r = agenda.calcular("19:00", momentos(), 2, {"louvor": hoje(19, 5, 30)}, hoje(19, 6))
conferir("30 segundos de diferenca: no horario", r["estado"] == "no_horario" and r["texto"] == "No horário", r["texto"])
r = agenda.calcular("19:00", momentos(), 2, {"louvor": hoje(19, 2)}, hoje(19, 3))
conferir("entrou as 19:02: 3 min adiantado", r["estado"] == "adiantado" and r["texto"] == "3 min adiantado", r["texto"])
r = agenda.calcular("19:00", momentos(), 2, {"louvor": hoje(19, 5)}, hoje(19, 30))
conferir("louvor passou do fim: o atraso cresce", r["atraso_s"] == 480 and r["texto"] == "8 min atrasado", r)
conferir("o que falta fica negativo", r["momentos"][2]["resta_s"] == -480, r["momentos"][2])
r = agenda.calcular("19:00", momentos(), None, {}, hoje(19, 10))
conferir("passou da hora e nada comecou: atrasado", r["estado"] == "atrasado", r)

print("\nQuando falta dado")
r = agenda.calcular(None, momentos(), 2, {"louvor": hoje(19, 7)}, hoje(19, 8))
conferir("sem a hora do culto: sem horarios e sem atraso",
         all(m["hora"] is None for m in r["momentos"]) and r["texto"] is None and r["atraso_s"] is None)
conferir("mas 'quanto falta' do momento atual continua valendo", r["momentos"][2]["resta_s"] == 16 * 60, r["momentos"][2])
r = agenda.calcular("25:99", momentos(), None, {}, hoje(19, 0))
conferir("hora invalida nao estoura", r["texto"] is None)
ids = ["abertura", "batismo", "louvor"]
r = agenda.calcular("19:00", momentos(ids), 0, {"abertura": hoje(19, 0)}, hoje(19, 1))
horas = [m["hora"] for m in r["momentos"]]
conferir("momento sem minutos: ele tem hora, os seguintes nao", horas == ["19:00", "19:05", None], horas)
r = agenda.calcular("19:00", momentos(ids, {"batismo": {"minutos": 10}}), 1, {}, hoje(19, 6))
horas = [m["hora"] for m in r["momentos"]]
conferir("`minutos:` na cue vale", horas == ["19:00", "19:05", "19:15"], horas)
conferir("sem a hora de entrada: sem 'falta', sem estourar", r["momentos"][1]["resta_s"] is None)
conferir("minutos da cue ganham do padrao", agenda.minutos_de("louvor", {"minutos": 25}) == (25, False))
conferir("minutos absurdos sao ignorados", agenda.minutos_de("louvor", {"minutos": "abc"})[0] is None)
conferir("`antes` na cue vale", agenda.minutos_de("ensaio", {"minutos": 30, "antes": True}) == (30, True))
r = agenda.calcular("19:00", [], None, {}, hoje(19, 0))
conferir("ordem vazia nao estoura", r["momentos"] == [])

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
