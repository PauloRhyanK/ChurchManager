"""Testes da TRANSICAO SUAVE entre movimentos de luz (a caixinha do painel).

    python _testar_transicao_suave.py

Rodam sem luz, sem OBS e sem servidor: o motor de movimento e o seguidor do
PC do som, direto.
"""

import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from ponte import movimento, seguidor   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


# Uma cortina de pares (so brilho) e uma cabeca movel no teto.
GRUPOS = {
    "cortina": {"bases": [1], "brilho": 0},
    "teto": {"bases": [101], "brilho": 0, "pan": 1, "tilt": 2, "obturador": 3},
}
MODOS = {
    "pulsar": {"nome": "Pulsar", "efeitos": [
        {"grupo": "cortina", "tipo": "respirar", "periodo": 2.0, "minimo": 0.0}]},
    "girar": {"nome": "Girar", "efeitos": [
        {"grupo": "teto", "tipo": "circulo", "periodo": 4.0, "raio": 40}]},
    "estrobo": {"nome": "Estrobo", "perigoso": True, "efeitos": [
        {"grupo": "teto", "tipo": "estrobo", "periodo": 1.0, "valor": 200}]},
}
CENA = bytearray(512)
CENA[0] = 200          # cortina acesa
CENA[100] = 255        # brilho do teto
CENA[101] = 128        # pan
CENA[102] = 128        # tilt
CENA[103] = 255        # obturador aberto

D = movimento.Movimento.DURACAO_SUAVE


def rodar(motor, t):
    return motor.aplicar(bytearray(CENA), t)


print("\nDesligada: tudo como antes")
motor = movimento.Movimento(GRUPOS, MODOS)
conferir("comeca desligada", motor.suave() is False)
motor.escolher("girar")
rodar(motor, 0.0)
motor.escolher("parado")
conferir("parado volta seco para a cena", bytes(rodar(motor, 0.1)) == bytes(CENA))
conferir("e o motor nao fica ativo a toa", motor.ativo() is False)

print("\nLigada: a troca esmaece")
motor = movimento.Movimento(GRUPOS, MODOS)
motor.definir_suave(True)
motor.escolher("girar")
saida_girando = None
for passo in range(int(D * 30) + 10):          # o circulo ja girando, sem mistura
    saida_girando = rodar(motor, passo / 30.0)
t_troca = (int(D * 30) + 10) / 30.0
pan_antes = saida_girando[101]
conferir("o circulo estava fora do centro", pan_antes != 128, pan_antes)
motor.escolher("parado")
conferir("durante a transicao o motor segue ativo (30 quadros/s)", motor.ativo() is True)
logo = rodar(motor, t_troca)
conferir("no primeiro quadro, o pan ainda e o de antes", logo[101] == pan_antes, (logo[101], pan_antes))
meio = rodar(motor, t_troca + D / 2)
conferir("no meio, o pan esta entre o de antes e a cena",
         min(pan_antes, 128) < meio[101] < max(pan_antes, 128), meio[101])
fim = rodar(motor, t_troca + D + 0.01)
conferir("no fim, e exatamente a cena", bytes(fim) == bytes(CENA))
conferir("e o motor desliga", motor.ativo() is False)

print("\nDo parado para um modo: parte da cena, sem salto")
motor = movimento.Movimento(GRUPOS, MODOS)
motor.definir_suave(True)
# Uma saida velha guardada nao pode servir de ponto de partida.
motor._ultima_saida = bytes(512)
motor.escolher("pulsar")
primeiro = rodar(motor, 10.0)
conferir("o primeiro quadro e a cena (nao um quadro velho)", primeiro[0] == CENA[0], primeiro[0])
seco = movimento.Movimento(GRUPOS, MODOS)
seco.escolher("pulsar")
conferir("sem a caixinha, o pulsar comeca no minimo, de uma vez",
         seco.aplicar(bytearray(CENA), 10.0)[0] < 20, seco.aplicar(bytearray(CENA), 10.0)[0])

print("\nO que nao pode esmaecer")
motor = movimento.Movimento(GRUPOS, MODOS)
motor.definir_suave(True)
cena_fechada = bytearray(CENA)
cena_fechada[103] = 0
motor.escolher("pulsar")
motor.aplicar(bytearray(cena_fechada), 0.0)
motor.escolher("parado")
meio = motor.aplicar(bytearray(CENA), D / 2)     # cena nova com obturador aberto
conferir("o obturador nunca passa pelo meio (e la mora o estrobo)", meio[103] == 255, meio[103])
motor.escolher("estrobo")
conferir("entrar no estrobo e seco", motor._transicao is None)
motor.escolher("parado")
conferir("sair do estrobo e seco", motor._transicao is None)

print("\nRepetir o mesmo modo nao e troca")
motor = movimento.Movimento(GRUPOS, MODOS)
motor.definir_suave(True)
motor.escolher("girar")
for passo in range(int(D * 30) + 10):
    rodar(motor, passo / 30.0)
motor.escolher("girar")
conferir("o seguidor reescolhe o modo a cada cena; isso nao recomeca nada", motor._transicao is None)

print("\nDesmarcar no meio corta a transicao")
motor.escolher("parado")
motor.definir_suave(False)
conferir("sem transicao pendurada", motor._transicao is None and motor.ativo() is False)


print("\nO PC do som recebe a caixinha")


class ClienteDeMentira:
    def __init__(self):
        self.aplicados = []

    def aplicar(self, quadro):
        self.aplicados.append(quadro)


motor_la = movimento.Movimento(GRUPOS, MODOS)
seg = seguidor.Seguidor("http://x", ClienteDeMentira(), movimento=motor_la, aviso=lambda *_: None)
seg._aplicar({"versao": 1, "canais": {"1": 200}, "modo": "pulsar", "suave": True})
conferir("ligada pelo fio", motor_la.suave() is True)
aplicados = len(seg._cliente.aplicados)
seg._aplicar({"versao": 1, "canais": {"1": 200}, "modo": "pulsar", "suave": False})
conferir("desligar sozinha chega, sem reaplicar a cena",
         motor_la.suave() is False and len(seg._cliente.aplicados) == aplicados)
seg._aplicar({"versao": 2, "canais": {"1": 200}, "modo": "pulsar"})
conferir("ponte antiga (sem a chave) nao mexe na caixinha", motor_la.suave() is False)

print()
if FALHAS:
    print("{} FALHA(S): {}".format(len(FALHAS), ", ".join(FALHAS)))
    sys.exit(1)
print("Tudo certo.")
