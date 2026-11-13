"""Testes do vigia do retorno na TV. Rodam sem TV e sem Sunshine:

    python _testar_vigia_tv.py

O registro do Sunshine e um arquivo temporario que o teste escreve; a TV e o
script do retorno sao funcoes de mentira; o relogio e do teste.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import vigia_tv

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


class Mundo:
    """Uma TV, um Sunshine e um relogio de mentira."""

    def __init__(self, conf=None, volta_ao_reabrir=True):
        self.agora = 1_800_000_000.0     # um dia qualquer, ao meio-dia e pouco
        self.pasta = tempfile.mkdtemp()
        self.log = os.path.join(self.pasta, "sunshine.log")
        self.tv_ligada = True
        self.app = vigia_tv.MOONLIGHT
        self.reaberturas = 0
        self.perguntas_a_tv = 0
        self.volta_ao_reabrir = volta_ao_reabrir
        self.registro = []
        conf = dict(conf or {}, log=self.log)
        self.vigia = vigia_tv.VigiaDaTV(
            conf, ip_da_tv=lambda: "192.168.1.53" if self.tv_ligada else None,
            na_tela=self._na_tela, reabrir=self._reabrir, relogio=lambda: self.agora,
            dormir=self._dormir, registrar=self.registro.append)

    def escrever(self, linha):
        with open(self.log, "ab") as arq:
            arq.write(("[2026-11-12 19:35:01.000]: Info: " + linha + "\n").encode())

    def _na_tela(self, ip):
        self.perguntas_a_tv += 1
        return self.app

    def _reabrir(self):
        self.reaberturas += 1
        if self.volta_ao_reabrir:
            self.escrever("CLIENT CONNECTED")
        return True, "comando enviado"

    def _dormir(self, segundos):
        self.agora += segundos

    def passar(self, segundos, passo=5.0):
        fim = self.agora + segundos
        while self.agora < fim:
            self.vigia.olhar()
            self.agora += passo
        return self.vigia.retrato()


print("\n1. Sem o registro do Sunshine, o vigia nao faz nada")
m = Mundo()
r = m.passar(120)
conferir("estado sem_sinal", r["estado"] == "sem_sinal", r)
conferir("nao reabriu", m.reaberturas == 0)

print("\n2. Retorno nunca aberto: nao inventa de abrir")
m = Mundo()
m.escrever("Sunshine iniciado")
r = m.passar(300)
conferir("estado fechado", r["estado"] == "fechado", r)
conferir("nao reabriu", m.reaberturas == 0)

print("\n3. Caiu no meio do culto: espera 25 s e reabre UMA vez")
m = Mundo()
m.escrever("CLIENT CONNECTED")
r = m.passar(20)
conferir("no ar", r["estado"] == "no_ar" and r["no_ar"], r)
m.escrever("CLIENT DISCONNECTED")
r = m.passar(20)
conferir("aos 20 s ainda nao mexeu", m.reaberturas == 0 and r["estado"] == "caiu", r)
r = m.passar(40)
conferir("reabriu uma vez", m.reaberturas == 1, m.reaberturas)
conferir("voltou a no_ar pela medida", r["estado"] == "no_ar", r)
conferir("anotou a queda e a volta", len(m.registro) == 2, m.registro)
r = m.passar(600)
conferir("no ar, nao mexe mais", m.reaberturas == 1)

print("\n4. A TV nao volta: tenta de 2 em 2 minutos, para na terceira")
m = Mundo(volta_ao_reabrir=False)
m.escrever("CLIENT CONNECTED"); m.passar(10)
m.escrever("CLIENT DISCONNECTED")
r = m.passar(40)
conferir("primeira tentativa", m.reaberturas == 1, m.reaberturas)
quando = m.vigia.retrato()["ultima_tentativa"]
r = m.passar(quando + 110 - m.agora)
conferir("nao repete antes de 2 minutos", m.reaberturas == 1, m.reaberturas)
r = m.passar(30)
conferir("repete depois de 2 minutos", m.reaberturas == 2, m.reaberturas)
r = m.passar(900)
conferir("parou em 3 tentativas", m.reaberturas == 3, m.reaberturas)
conferir("estado desistiu", r["estado"] == "desistiu" and r["tentativas"] == 3, r)
m.tv_ligada = False
r = m.passar(30)
conferir("TV desligada", r["estado"] == "tv_desligada", r)
m.tv_ligada = True
m.volta_ao_reabrir = True
r = m.passar(200)
conferir("TV sumiu e voltou: tenta de novo", m.reaberturas == 4 and r["estado"] == "no_ar", (m.reaberturas, r["estado"]))

print("\n5. Outro aplicativo na tela: nao mexe")
m = Mundo()
m.escrever("CLIENT CONNECTED"); m.passar(10)
m.app = "com.webos.app.hdmi1"
m.escrever("CLIENT DISCONNECTED")
r = m.passar(300)
conferir("estado outro_app", r["estado"] == "outro_app", r)
conferir("nao reabriu", m.reaberturas == 0)
m.app = None
r = m.passar(60)
conferir("TV nao diz o que tem na tela: reabre", m.reaberturas == 1, m.reaberturas)

print("\n6. TV desligada: nada e enviado")
m = Mundo()
m.escrever("CLIENT CONNECTED"); m.passar(10)
m.tv_ligada = False
m.escrever("CLIENT DISCONNECTED")
r = m.passar(300)
conferir("estado tv_desligada", r["estado"] == "tv_desligada", r)
conferir("nao reabriu nem perguntou a TV", m.reaberturas == 0 and m.perguntas_a_tv == 0)

print("\n7. Pausar e retomar")
m = Mundo()
m.escrever("CLIENT CONNECTED"); m.passar(10)
m.vigia.pausar(minutos=30)
m.escrever("CLIENT DISCONNECTED")
r = m.passar(600)
conferir("pausado nao mexe", m.reaberturas == 0 and r["estado"] == "pausado" and r["pausado"], r)
r = m.passar(1300)
conferir("a pausa de 30 min acaba sozinha", m.reaberturas == 1, m.reaberturas)
m.escrever("CLIENT DISCONNECTED")
m.vigia.pausar()
m.vigia.retomar()
r = m.passar(200)
conferir("retomar volta a vigiar", m.reaberturas == 2, m.reaberturas)

print("\n8. O Sunshine reinicia e o registro recomeca")
m = Mundo()
for _ in range(50):
    m.escrever("linha qualquer do encoder")
m.escrever("CLIENT CONNECTED")
r = m.passar(10)
conferir("no ar", r["estado"] == "no_ar")
os.replace(m.log, m.log + ".1")
m.escrever("Sunshine iniciado")
r = m.passar(10)
conferir("registro novo e menor: sessao caiu", r["estado"] == "caiu", r)
r = m.passar(60)
conferir("reabriu depois da rotacao", m.reaberturas == 1 and r["estado"] == "no_ar", (m.reaberturas, r["estado"]))

print("\n9. Linha pela metade nao engana")
m = Mundo()
m.escrever("CLIENT CONNECTED"); m.passar(10)
with open(m.log, "ab") as arq:
    arq.write(b"[2026-11-12 21:14:00.000]: Info: CLIENT DISCONN")
r = m.passar(10)
conferir("meia linha ainda nao conta", r["estado"] == "no_ar", r)
with open(m.log, "ab") as arq:
    arq.write(b"ECTED\n")
r = m.passar(10)
conferir("linha inteira conta", r["estado"] == "caiu", r)

print("\n10. Botao de abrir na mao arma o vigia; janela de horario")
m = Mundo()
m.escrever("Sunshine iniciado"); m.passar(60)
m.vigia.abriram_na_mao()
r = m.passar(100)
conferir("depois do botao espera o intervalo", m.reaberturas == 0, m.reaberturas)
r = m.passar(120)
conferir("e entao cuida do retorno", m.reaberturas == 1, m.reaberturas)
m = Mundo(conf={"janela": ["03:00", "03:05"]})
m.escrever("CLIENT CONNECTED"); m.passar(10)
m.escrever("CLIENT DISCONNECTED")
r = m.passar(300)
conferir("fora da janela nao mexe", m.reaberturas == 0 and r["estado"] == "fora_da_janela", r)
m = Mundo(conf={"ativo": False})
conferir("ativo: false e respeitado", m.vigia.ativo is False)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
