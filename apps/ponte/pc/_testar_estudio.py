"""Testa o motor do Estudio de luz, sem ponte no ar e sem hardware.

Roda sozinho:  python _testar_estudio.py

Tres perguntas, e a resposta de cada uma precisa ser "sim" antes de qualquer
refletor receber isto:

  1. Sem usar o estudio, o motor continua EXATAMENTE como era?
  2. Os limites seguram? (velocidade e alcance das cabecas, luz de frente,
     estrobo, valores absurdos vindos de fora)
  3. Um seguidor ANTIGO — o PC do som, que nao sera atualizado junto — recebe
     algo que ele entende e que deixa a luz quieta?

Le os grupos e os modos do config.exemplo.yaml, que e o patch da igreja.
"""

import copy
import json
import math
import os
import sys

import yaml

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from ponte import luzes as mod_luzes            # noqa: E402
from ponte import movimento as mod_movimento    # noqa: E402
from ponte import seguidor as mod_seguidor      # noqa: E402

falhas = []


def checar(nome, ok, detalhe=""):
    print(("  OK   " if ok else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not ok:
        falhas.append(nome)


cfg = yaml.safe_load(open(os.path.join(AQUI, "config.exemplo.yaml"), encoding="utf-8"))
GRUPOS, MODOS = cfg["grupos_de_luz"], cfg["movimentos"]
PASSO = 1.0 / 30.0      # a taxa em que o cliente de luz chama o motor


def motor_novo(grupos=None):
    return mod_movimento.Movimento(grupos or GRUPOS, MODOS)


def cena():
    """Tudo aceso: frente branca, barra, cortina e teto apontando para o palco."""
    q = bytearray(512)
    q[3] = 255                                   # frente: branco
    for base in (17, 33):
        q[base - 1:base + 3] = bytes([0, 0, 200, 0])
    for base in (49, 65, 81, 97):
        q[base - 1] = 200                        # brilho
        q[base + 5] = 255                        # azul
    for base in (113, 129, 145):
        q[base - 1], q[base] = 128, 128          # pan, tilt
        q[base + 1] = 255                        # obturador aberto
        q[base + 4] = 255                        # azul
    return q


def rodar(motor, segundos, base=None, t0=0.0):
    """Chama o motor como o cliente de luz chama: 30 vezes por segundo."""
    quadros, t = [], t0
    for _ in range(int(segundos / PASSO)):
        quadros.append(motor.aplicar(bytearray(base or cena()), t))
        t += PASSO
    return quadros


# O maior salto de pan/tilt, de um quadro para o seguinte, que os MODOS DO
# CULTO ja fazem em regime. E a regua contra a qual o estudio e medido.
def maior_passo(quadros, canais):
    return max(abs(b[c - 1] - a[c - 1]) for a, b in zip(quadros, quadros[1:]) for c in canais)


PAN_TILT = [113, 114, 129, 130, 145, 146]

print("[1] sem estudio em uso, o motor e o mesmo de antes")
motor = motor_novo()
checar("nasce parado", motor.atual() is None and not motor.ativo())
checar("sem animacao do estudio", motor.estudio() is None)
q = cena()
checar("parado devolve a cena intacta", motor.aplicar(bytearray(q), 3.7) == q)
# Os oito modos, calculados pelo motor de agora, contra a MESMA conta feita a
# mao a partir do config — se alguma linha do estudio vazasse para os modos,
# o circulo do "lento" sairia diferente daqui.
motor.escolher("lento")
efeito = MODOS["lento"]["efeitos"][0]
t = 4.2
saida = motor.aplicar(bytearray(cena()), t)
iguais = True
for indice, base in enumerate(GRUPOS["teto"]["bases"]):
    fase = (t / efeito["periodo"] + efeito["defasagem"] * indice) % 1.0
    pan = int(round(128 + efeito["raio"] * math.cos(2 * math.pi * fase)))
    tilt = int(round(128 + efeito["raio"] * math.sin(2 * math.pi * fase)))
    pan = max(efeito["pan_min"], min(efeito["pan_max"], pan))
    tilt = max(efeito["tilt_min"], min(efeito["tilt_max"], tilt))
    iguais = iguais and saida[base - 1] == pan and saida[base] == tilt
checar("o circulo do modo 'lento' bate com a conta do config", iguais)
checar("o catalogo tem os mesmos modos do config",
       sorted(m["id"] for m in motor.catalogo()) == sorted(MODOS))
for nome in MODOS:
    motor.escolher(nome)
    a = motor.aplicar(bytearray(cena()), 2.0)
    b = motor.aplicar(bytearray(cena()), 2.0)
    if a != b:
        checar("modo {} e funcao so do tempo".format(nome), False)
checar("os modos nao guardam estado entre chamadas", True)
motor.escolher("celebracao")
checar("a `paleta` nova do config nao fez o teto pulsar nos modos",
       all(q[117] == 255 for q in rodar(motor, 3.0)))
motor.escolher("parado")

# A regua: o que os modos do culto ja fazem com as cabecas.
motor.escolher("celebracao")
REGUA_CIRCULO = maior_passo(rodar(motor, 8.0)[30:], PAN_TILT)
motor.escolher("pendulo")
REGUA_PENDULO = maior_passo(rodar(motor, 8.0)[30:], PAN_TILT)
motor.escolher("parado")
print("       regua dos modos atuais: circulo {} e pendulo {} passos por quadro".format(
    REGUA_CIRCULO, REGUA_PENDULO))

print("\n[2] valores de fora sao limitados ou recusados")
motor = motor_novo()
limpo = motor.definir_estudio({"tipo": "circulo", "luzes": [113, 129, 145],
                               "velocidade": 9999, "tamanho": 9999, "atraso": -50})
checar("velocidade, tamanho e atraso ficam em 0-100",
       (limpo["velocidade"], limpo["tamanho"], limpo["atraso"]) == (100, 100, 0), str(limpo))
checar("velocidade no maximo = o periodo mais curto permitido",
       motor.estudio_detalhe()["periodo"] == 3.5, str(motor.estudio_detalhe()))
checar("tamanho no maximo = o raio maximo permitido",
       motor.estudio_detalhe()["raio"] == 56.0, str(motor.estudio_detalhe()))
limpo = motor.definir_estudio({"tipo": "circulo", "luzes": [113], "bpm": 5000})
checar("batidas por minuto ficam em 40-200", limpo["bpm"] == 200, str(limpo["bpm"]))
checar("musica rapida nao acelera a cabeca alem do teto",
       motor.estudio_detalhe()["periodo"] >= 3.5, str(motor.estudio_detalhe()))
for bpm in (40, 72, 110, 137, 200):
    for tipo in mod_movimento.Movimento.ESTUDIO_TIPOS:
        pedido = {"tipo": tipo, "luzes": [49, 113], "bpm": bpm,
                  "cores": [{"4": [255, 0, 0, 0], "5": [255, 0, 0, 0, 0]},
                            {"4": [0, 0, 255, 0], "5": [0, 0, 255, 0, 0]}]}
        motor.definir_estudio(pedido)
        if motor.estudio_detalhe()["periodo"] < mod_movimento.Movimento.ESTUDIO_PERIODO[tipo][1] - 1e-9:
            checar("{} a {} bpm respeita o teto".format(tipo, bpm), False)
checar("com o tempo batido, nenhum tipo passa do seu teto de velocidade", True)

recusados = {
    "tipo que nao existe": {"tipo": "invencao", "luzes": [113]},
    "estrobo pelo estudio": {"tipo": "estrobo", "luzes": [113]},
    "piscar forte pelo estudio": {"tipo": "piscar_forte", "luzes": [113]},
    "sem lista de luzes": {"tipo": "respirar"},
    "lista de luzes vazia": {"tipo": "respirar", "luzes": []},
    "so a luz de frente": {"tipo": "respirar", "luzes": [1]},
    "endereco inventado": {"tipo": "respirar", "luzes": [300, "abc", None]},
    "velocidade que nao e numero": {"tipo": "respirar", "luzes": [49], "velocidade": "rapido"},
    "velocidade infinita": {"tipo": "respirar", "luzes": [49], "velocidade": float("inf")},
    "tamanho booleano": {"tipo": "respirar", "luzes": [49], "tamanho": True},
    "bpm que nao e numero": {"tipo": "batida", "luzes": [49], "bpm": "allegro"},
    "trocar cores sem cores": {"tipo": "trocar_cores", "luzes": [49]},
    "trocar cores com uma cor so": {"tipo": "trocar_cores", "luzes": [49], "cores": [{"5": [1, 2, 3, 4, 5]}]},
    "cor com valores de menos": {"tipo": "trocar_cores", "luzes": [49],
                                 "cores": [{"5": [1, 2]}, {"5": [1, 2, 3, 4, 5]}]},
    "formato estranho": ["circulo"],
}
motor.escolher("parado")
for nome, pedido in recusados.items():
    try:
        motor.definir_estudio(pedido)
        checar("recusa: " + nome, False, "aceitou")
    except mod_movimento.ErroMovimento:
        checar("recusa: " + nome, motor.estudio() is None and not motor.ativo())
limpo = motor.definir_estudio({"tipo": "respirar", "luzes": [1, 49, 49, 300, "65"]})
checar("a luz de frente e endereco desconhecido ficam de fora da lista",
       limpo["luzes"] == [49, 65], str(limpo["luzes"]))
limpo = motor.definir_estudio({"tipo": "trocar_cores", "luzes": [49],
                               "cores": [{"5": [999, -5, 0, 0, 0], "canal": 50},
                                         {"5": [0, 0, 255, 0, 0]}]})
checar("valor de cor fora de 0-255 e limitado", limpo["cores"][0]["5"][:2] == [255, 0], str(limpo["cores"][0]))
checar("chave estranha dentro da cor e descartada", list(limpo["cores"][0]) == ["5"])
checar("'parado' desliga", motor.definir_estudio({"tipo": "parado"}) is None and not motor.ativo())

print("\n[3] as cabecas: nunca mais rapido nem mais longe que os modos do culto")
motor = motor_novo()
for tipo, regua in (("circulo", REGUA_CIRCULO), ("vai_e_vem", REGUA_PENDULO), ("varrer", REGUA_PENDULO)):
    motor.escolher("parado")
    motor.definir_estudio({"tipo": tipo, "luzes": [113, 129, 145], "velocidade": 100,
                           "tamanho": 100, "atraso": 100, "espelhar": True})
    quadros = rodar(motor, 20.0)
    valores = {q[c - 1] for q in quadros for c in PAN_TILT}
    checar("{}: fica dentro da cerca 64-192".format(tipo), min(valores) >= 64 and max(valores) <= 192,
           "{} a {}".format(min(valores), max(valores)))
    checar("{}: de fato se mexe".format(tipo), len(valores) > 20, "{} valores".format(len(valores)))
    checar("{}: no maximo, nao anda mais por quadro que o modo atual".format(tipo),
           maior_passo(quadros, PAN_TILT) <= regua,
           "{} contra {}".format(maior_passo(quadros, PAN_TILT), regua))
    checar("{}: comeca de onde a cena apontou, sem tranco".format(tipo),
           all(abs(quadros[1][c - 1] - 128) <= regua for c in PAN_TILT))

# O pior caso: alguem mexe em tudo ao mesmo tempo, com a animacao rodando.
motor.escolher("parado")
quadros, t = [], 0.0
pedidos = [
    {"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 100, "tamanho": 100, "atraso": 0},
    {"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 100, "tamanho": 100, "atraso": 100},
    {"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 0, "tamanho": 100, "atraso": 100, "espelhar": True},
    {"tipo": "vai_e_vem", "luzes": [113, 129, 145], "velocidade": 100, "tamanho": 100, "atraso": 100},
    {"tipo": "varrer", "luzes": [129], "velocidade": 100, "tamanho": 100, "atraso": 37, "espelhar": True},
    {"tipo": "circulo", "luzes": [113, 145], "velocidade": 100, "tamanho": 5, "bpm": 200},
    {"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 100, "tamanho": 100, "atraso": 50},
]
base = cena()
for volta in range(60):
    motor.definir_estudio(pedidos[volta % len(pedidos)])
    if volta == 30:
        # e ainda arrasta a direcao para o outro canto no meio do caminho
        for b in (113, 129, 145):
            base[b - 1], base[b] = 190, 70
    for _ in range(11):
        quadros.append(motor.aplicar(bytearray(base), t))
        t += PASSO
checar("trocar tudo no meio do caminho nao da tranco",
       maior_passo(quadros, PAN_TILT) <= REGUA_CIRCULO,
       "{} contra {}".format(maior_passo(quadros, PAN_TILT), REGUA_CIRCULO))

# Saindo do forro (255/255, fora da cerca): caminha para dentro, nao salta.
motor.escolher("parado")
forro = cena()
for b in (113, 129, 145):
    forro[b - 1], forro[b] = 255, 255
motor.definir_estudio({"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 100, "tamanho": 100})
quadros = [forro] + rodar(motor, 6.0, base=forro)
checar("partindo do forro, entra na cerca andando",
       maior_passo(quadros, PAN_TILT) <= REGUA_CIRCULO,
       "{} contra {}".format(maior_passo(quadros, PAN_TILT), REGUA_CIRCULO))
checar("e chega la dentro", all(64 <= quadros[-1][c - 1] <= 192 for c in PAN_TILT))

motor.escolher("parado")
motor.definir_estudio({"tipo": "circulo", "luzes": [113], "velocidade": 100, "tamanho": 100})
quadros = rodar(motor, 6.0)
checar("so a luz escolhida se mexe",
       len({q[112] for q in quadros}) > 10
       and all(q[128] == 128 and q[129] == 128 and q[144] == 128 and q[145] == 128 for q in quadros))
apagada = cena()
apagada[114] = 0
quadros = rodar(motor, 4.0, base=apagada)
checar("cabeca apagada nao se mexe", all(q[112] == 128 and q[113] == 128 for q in quadros))

# Uma cabeca que SAI da animacao (trocaram as luzes) caminha para casa.
motor.escolher("parado")
motor.definir_estudio({"tipo": "circulo", "luzes": [113], "velocidade": 100, "tamanho": 100})
quadros = rodar(motor, 5.0)
motor.definir_estudio({"tipo": "respirar", "luzes": [49], "velocidade": 100, "tamanho": 100})
quadros = quadros[-1:] + rodar(motor, 5.0, t0=5.0)
checar("cabeca que sai da animacao volta andando, sem salto",
       maior_passo(quadros, PAN_TILT) <= REGUA_CIRCULO,
       "{} contra {}".format(maior_passo(quadros, PAN_TILT), REGUA_CIRCULO))
checar("e chega exatamente onde a cena aponta", quadros[-1][112] == 128 and quadros[-1][113] == 128)

motor.escolher("parado")
motor.definir_estudio({"tipo": "circulo", "luzes": [49, 17], "velocidade": 100, "tamanho": 100})
checar("cortina e barra nao ganham movimento", all(q == cena() for q in rodar(motor, 3.0)))

print("\n[4] a luz de frente, o estrobo e o reset nunca sao tocados")
PROIBIDOS = [1, 2, 3, 4]                                         # frente
PROIBIDOS += [b + d for b in (49, 65, 81, 97) for d in (1, 2, 3)]  # estrobo, programa, velocidade
PROIBIDOS += [b + d for b in (113, 129, 145) for d in (2, 7, 8)]   # obturador, vazio, reset
todas = [1, 17, 33, 49, 65, 81, 97, 113, 129, 145]
cores = [{"4": [255, 255, 255, 255], "5": [255, 255, 255, 255, 255], "3": [255, 255, 255]},
         {"4": [0, 0, 255, 0], "5": [0, 0, 255, 0, 0]}]
intocados = True
for tipo in mod_movimento.Movimento.ESTUDIO_TIPOS:
    motor.escolher("parado")
    motor.definir_estudio({"tipo": tipo, "luzes": todas, "velocidade": 100, "tamanho": 100,
                           "atraso": 100, "espelhar": True, "cores": cores})
    referencia = cena()
    for q in rodar(motor, 6.0):
        if any(q[c - 1] != referencia[c - 1] for c in PROIBIDOS):
            intocados = False
checar("em todas as animacoes, com todas as luzes pedidas", intocados)

print("\n[5] intensidade e cor")
motor.escolher("parado")
motor.definir_estudio({"tipo": "respirar", "luzes": [49, 65], "velocidade": 100, "tamanho": 100})
quadros = rodar(motor, 6.0)
brilhos = {q[48] for q in quadros}
checar("a cortina escolhida respira", len(brilhos) > 20, "{} niveis".format(len(brilhos)))
checar("nunca passa do que a cena mandou", max(brilhos) <= 200, str(max(brilhos)))
checar("nunca desce abaixo de 20% da cena", min(brilhos) >= 40, str(min(brilhos)))
checar("a cortina NAO escolhida fica firme", all(q[80] == 200 and q[96] == 200 for q in quadros))
motor.definir_estudio({"tipo": "respirar", "luzes": [49], "velocidade": 100, "tamanho": 0})
checar("tamanho zero = sem variacao", all(q[48] == 200 for q in rodar(motor, 3.0)))
motor.definir_estudio({"tipo": "batida", "luzes": [113], "velocidade": 100, "tamanho": 100})
quadros = rodar(motor, 4.0)
checar("no teto, a batida escala a cor (nao ha canal de brilho)", len({q[117] for q in quadros}) > 5)
checar("e nao mexe na direcao nem no obturador",
       all(q[112] == 128 and q[113] == 128 and q[114] == 255 for q in quadros))
escuro = bytearray(512)
motor.definir_estudio({"tipo": "batida", "luzes": [49, 113, 17], "velocidade": 100, "tamanho": 100})
checar("animacao nunca ACENDE o que a cena deixou apagado",
       all(q == escuro for q in rodar(motor, 3.0, base=escuro)))

motor.escolher("parado")
motor.definir_estudio({"tipo": "trocar_cores", "luzes": [49, 113, 17], "velocidade": 100, "cores": [
    {"4": [255, 0, 0, 0], "5": [255, 0, 0, 0, 0]}, {"4": [0, 0, 255, 0], "5": [0, 0, 255, 0, 0]}]})
quadros = rodar(motor, 8.0)
checar("a cortina passa pelas duas cores", {q[52] for q in quadros} >= {0, 255} and {q[54] for q in quadros} >= {0, 255})
checar("o teto tambem", {q[115] for q in quadros} >= {0, 255})
checar("a barra tambem", {q[16] for q in quadros} >= {0, 255})
checar("o brilho da cortina nao muda na troca de cor", all(q[48] == 200 for q in quadros))
checar("a troca e suave, sem corte seco",
       max(abs(b[52] - a[52]) for a, b in zip(quadros, quadros[1:])) < 60,
       str(max(abs(b[52] - a[52]) for a, b in zip(quadros, quadros[1:]))))
checar("troca de cor nao acende o que estava apagado",
       all(q == escuro for q in rodar(motor, 3.0, base=escuro)))
# Um PC com o config ANTIGO (sem `paleta`): so a barra, que ja tinha `cores`.
antigos = copy.deepcopy(GRUPOS)
for g in antigos.values():
    g.pop("paleta", None)
velho = motor_novo(antigos)
velho.definir_estudio({"tipo": "trocar_cores", "luzes": [49, 113, 17], "velocidade": 100, "cores": [
    {"4": [255, 0, 0, 0], "5": [255, 0, 0, 0, 0]}, {"4": [0, 0, 255, 0], "5": [0, 0, 255, 0, 0]}]})
quadros = rodar(velho, 8.0)
checar("config sem `paleta`: cortina e teto ficam na cor da cena",
       all(q[48:57] == cena()[48:57] and q[112:121] == cena()[112:121] for q in quadros))
checar("config sem `paleta`: as capacidades dizem isso para a tela",
       velho.capacidades_estudio()["49"]["cores"] == 0 and velho.capacidades_estudio()["17"]["cores"] == 4)

print("\n[6] estudio e modos do culto nao se somam, e 'parado' para tudo")
motor = motor_novo()
motor.escolher("lento")
motor.definir_estudio({"tipo": "respirar", "luzes": [49]})
checar("ligar uma animacao do estudio desliga o modo do culto", motor.atual() is None and motor.ativo())
motor.escolher("lento")
checar("escolher um modo do culto desliga a animacao do estudio",
       motor.atual() == "lento" and motor.estudio() is None)
motor.definir_estudio({"tipo": "circulo", "luzes": [113], "velocidade": 100, "tamanho": 100})
rodar(motor, 2.0)
motor.escolher("parado")
checar("'parado' (o botao do painel) para o estudio tambem", motor.estudio() is None and not motor.ativo())
checar("e devolve a cena exata", motor.aplicar(bytearray(cena()), 9.0) == cena())
checar("as cues do exemplo nao citam estudio nem modo",
       "estudio" not in json.dumps(cfg.get("cues")).lower() and "modo" not in json.dumps(cfg.get("cues")).lower())

print("\n[7] o quadro que o PC do som busca")
motor = motor_novo()
agente = mod_luzes.ClienteAgente("PC do som")
agente.aplicar({i + 1: v for i, v in enumerate(cena())})


def quadro_servido():
    """A mesma montagem de /api/luz/quadro em app.py."""
    corpo = agente.retrato()
    corpo["modo"] = motor.atual() or "parado"
    espec = motor.estudio()
    if espec is not None:
        corpo["estudio"] = espec
    return json.loads(json.dumps(corpo))     # como chega do outro lado do fio


corpo = quadro_servido()
checar("sem estudio em uso, o quadro tem as mesmas tres chaves de sempre",
       sorted(corpo) == ["canais", "modo", "versao"], str(sorted(corpo)))
motor.escolher("lento")
checar("com um modo do culto, idem", sorted(quadro_servido()) == ["canais", "modo", "versao"]
       and quadro_servido()["modo"] == "lento")
motor.definir_estudio({"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 80, "tamanho": 90,
                       "atraso": 67, "espelhar": True})
corpo = quadro_servido()
checar("com animacao do estudio, o campo 'modo' diz parado", corpo["modo"] == "parado", corpo["modo"])
checar("a animacao viaja numa chave a parte", corpo.get("estudio", {}).get("tipo") == "circulo")
checar("e so com numeros de 0 a 100, sem periodo nem raio",
       sorted(corpo["estudio"]) == ["atraso", "bpm", "espelhar", "luzes", "tamanho", "tipo", "velocidade"],
       str(sorted(corpo["estudio"])))


class ClienteDeTeste:
    """Guarda o quadro e aplica o motor, como o ClienteArtNet faz ao enviar."""

    def __init__(self, modulador):
        self.quadro = bytearray(512)
        self.modulador = modulador

    def aplicar(self, canais):
        for canal, valor in canais.items():
            self.quadro[int(canal) - 1] = int(valor)

    def saida(self, t):
        return self.modulador.aplicar(bytearray(self.quadro), t)


class MovimentoAntigo:
    """O motor ANTES do estudio, reduzido ao que o seguidor usa dele:
    conhece os modos do config e levanta para nome desconhecido. Nao tem
    definir_estudio — se o seguidor antigo tentasse chamar, este teste cairia."""

    def __init__(self):
        self._interno = mod_movimento.Movimento(GRUPOS, MODOS)

    def escolher(self, nome):
        return self._interno.escolher(nome)

    def aplicar(self, quadro, t):
        return self._interno.aplicar(quadro, t)


def aplicar_como_seguidor_antigo(corpo, cliente, movimento, visto):
    """Copia fiel do Seguidor._aplicar que roda hoje no PC do som (commit
    31aac7c), sem o saneamento, que nao muda a pergunta. O que importa: ele le
    SO versao, canais e modo. Devolve a nova assinatura."""
    assinatura = (corpo.get("versao"), corpo.get("modo"))
    if assinatura == visto:
        return visto
    quadro = {numero: 0 for numero in range(1, 513)}
    for canal, valor in (corpo.get("canais") or {}).items():
        quadro[int(canal)] = int(valor)
    cliente.aplicar(quadro)
    try:
        movimento.escolher(corpo.get("modo") or "parado")
    except Exception:
        pass
    return assinatura


antigo_motor = MovimentoAntigo()
antigo_cliente = ClienteDeTeste(antigo_motor)
visto = aplicar_como_seguidor_antigo(corpo, antigo_cliente, antigo_motor, None)
saidas = [antigo_cliente.saida(i * PASSO) for i in range(150)]
checar("SEGUIDOR ANTIGO: recebe a cena certa", saidas[0] == cena())
checar("SEGUIDOR ANTIGO: a luz fica parada (nao enlouquece nem quebra)",
       all(s == cena() for s in saidas))
# Estava num modo do culto e o estudio entra por cima: o antigo tem de PARAR,
# e nao continuar no modo de antes.
motor.escolher("celebracao")
visto = aplicar_como_seguidor_antigo(quadro_servido(), antigo_cliente, antigo_motor, visto)
checar("SEGUIDOR ANTIGO: segue os modos do culto como sempre",
       len({bytes(antigo_cliente.saida(i * PASSO)) for i in range(90)}) > 10)
motor.definir_estudio({"tipo": "vai_e_vem", "luzes": [113], "velocidade": 100, "tamanho": 100})
visto = aplicar_como_seguidor_antigo(quadro_servido(), antigo_cliente, antigo_motor, visto)
checar("SEGUIDOR ANTIGO: saindo de um modo para o estudio, ele para",
       all(antigo_cliente.saida(i * PASSO) == cena() for i in range(90)))
# Piscar forte na tela do estudio = o modo perigoso de sempre, pelo nome.
motor.escolher("estrobo")
corpo = quadro_servido()
checar("piscar forte viaja como o modo 'estrobo' de sempre, sem chave nova",
       corpo["modo"] == "estrobo" and "estudio" not in corpo)

print("\n[8] o seguidor NOVO aplica a animacao, e confere tudo de novo")
avisos = []
novo_motor = motor_novo()
novo_cliente = ClienteDeTeste(novo_motor)
seguidor = mod_seguidor.Seguidor("http://127.0.0.1:1", novo_cliente, movimento=novo_motor,
                                 aviso=avisos.append)
motor.escolher("parado")
motor.definir_estudio({"tipo": "circulo", "luzes": [113, 129, 145], "velocidade": 100, "tamanho": 100})
seguidor._aplicar(quadro_servido())
saidas = [novo_cliente.saida(i * PASSO) for i in range(300)]
checar("o movimento acontece do lado de la", len({s[112] for s in saidas}) > 20)
checar("dentro da cerca", all(64 <= s[c - 1] <= 192 for s in saidas for c in PAN_TILT))
motor.definir_estudio({"tipo": "parado"})
seguidor._aplicar(quadro_servido())
checar("parar no estudio para la tambem", not novo_motor.ativo() and novo_cliente.saida(1.0) == cena())
motor.escolher("lento")
seguidor._aplicar(quadro_servido())
checar("modo do culto continua chegando pelo nome", novo_motor.atual() == "lento")

# Um quadro FORJADO, vindo de qualquer aparelho da rede.
forjado = quadro_servido()
forjado["versao"] = 9999
forjado["modo"] = "parado"
forjado["estudio"] = {"tipo": "circulo", "luzes": [1, 113], "velocidade": 10 ** 9, "tamanho": 10 ** 9,
                      "periodo": 0.01, "raio": 500, "pan_min": 0, "pan_max": 255, "valor": 255}
seguidor._aplicar(forjado)
saidas = [novo_cliente.saida(100 + i * PASSO) for i in range(300)]
checar("quadro forjado: periodo e raio pedidos de fora sao ignorados",
       maior_passo(saidas, PAN_TILT) <= REGUA_CIRCULO and
       all(64 <= s[c - 1] <= 192 for s in saidas for c in PAN_TILT),
       "passo {}".format(maior_passo(saidas, PAN_TILT)))
checar("quadro forjado: a luz de frente nao entra", all(s[0:4] == cena()[0:4] for s in saidas))
forjado["versao"] = 10000
forjado["estudio"] = {"tipo": "estrobo", "luzes": [49, 113], "valor": 255}
seguidor._aplicar(forjado)
checar("quadro forjado: estrobo pelo estudio vira PARADO", not novo_motor.ativo(), str(avisos[-1:]))
checar("e a cena entra assim mesmo", novo_cliente.saida(1.0) == cena())
checar("o seguidor avisou no registro", any("recusada" in a for a in avisos), str(avisos))

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
sys.exit(1 if falhas else 0)
