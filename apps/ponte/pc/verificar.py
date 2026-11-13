"""Checagem offline da ponte.

Roda sem OBS, sem Holyrics e sem luz nenhuma ligada. Confere o config.yaml,
o motor de cues e o pacote Art-Net (contra um receptor local, na propria
maquina — nao sai nada pela rede).

Rodar da pasta do projeto:
    .venv\\Scripts\\python.exe verificar.py
"""

import socket
import sys
import threading
import time

import yaml

from ponte.cues import executar
from ponte.holyrics import ClienteHolyrics, ErroHolyrics
from ponte.luzes import ClienteArtNet, ErroLuzes
from ponte.movimento import Movimento
from ponte.seguidor import Seguidor

falhas = []


def checar(nome, condicao, detalhe=""):
    print(("  OK   " if condicao else "  FALHA") + "  " + nome + ("  " + detalhe if detalhe else ""))
    if not condicao:
        falhas.append(nome)


print("\n[1] config.yaml")
cfg = yaml.safe_load(open("config.yaml", encoding="utf-8"))
ids = [c["id"] for c in cfg["cues"]]
checar("abre e tem cues", len(ids) > 0, str(ids))
checar("ids unicos", len(ids) == len(set(ids)))
looks_usadas = {p["luzes"] for c in cfg["cues"] for p in c["passos"] if "luzes" in p}
faltando = looks_usadas - set(cfg["looks"])
checar("toda look citada existe", not faltando, str(faltando) if faltando else "")
fora = [(n, ch, v) for n, lk in cfg["looks"].items() for ch, v in lk.items()
        if not (1 <= int(ch) <= 512 and 0 <= int(v) <= 255)]
checar("canais/valores na faixa", not fora, str(fora))


print("\n[1b] ordens de culto")
ordens = cfg.get("ordens") or []
checar("existe pelo menos uma ordem", len(ordens) > 0, "{} ordens".format(len(ordens)))

ids_cues = set(ids)
ids_ordens = [o.get("id") for o in ordens]
checar("ids de ordem unicos", len(ids_ordens) == len(set(ids_ordens)), str(ids_ordens))

# Uma ordem que cita cue inexistente e a falha mais provavel de config: alguem
# renomeia uma cue e esquece da ordem. O momento some do painel em silencio,
# e so se descobre no domingo.
for o in ordens:
    citadas = [str(m) for m in (o.get("momentos") or [])]
    faltando = [m for m in citadas if m not in ids_cues]
    checar("ordem '{}' so cita cues que existem".format(o.get("id")),
           not faltando, ", ".join(faltando) if faltando else "")
    checar("ordem '{}' nao repete momento".format(o.get("id")),
           len(citadas) == len(set(citadas)), "")
    checar("ordem '{}' nao esta vazia".format(o.get("id")), len(citadas) > 0, "")

padrao = cfg.get("ordem_padrao")
checar("ordem_padrao aponta para uma ordem que existe",
       padrao in set(ids_ordens), str(padrao))


print("\n[2] motor de cues, tudo desligado")
cue = {"passos": [{"luzes": "louvor"}, {"obs": {"requestType": "StartRecord"}},
                  {"holyrics": {"action": "X"}}, {"esperar": 0.05},
                  {"inventado": 1}, "lixo"]}
res = executar(cue, {"obs": None, "holyrics": None, "luzes": None, "looks": {}})
checar("nao levanta excecao", True)
checar("um resultado por passo", len(res) == 6, str(len(res)))
checar("desligados viram 'pulado'",
       [r["estado"] for r in res[:3]] == ["pulado"] * 3, str([r["estado"] for r in res[:3]]))
checar("esperar roda", res[3]["estado"] == "ok", res[3]["detalhe"])
checar("passo desconhecido vira erro", res[4]["estado"] == "erro")
checar("passo mal escrito vira erro", res[5]["estado"] == "erro")


print("\n[3] motor de cues, look inexistente com luz ligada")
# reenvio_segundos=0 em todos os clientes de teste, menos no bloco [8] que e
# justamente quem testa o reenvio. Sem isso, cada bloco deixa uma thread
# mandando pacote para sempre, e os blocos seguintes medem o trafego um do
# outro — foi exatamente o que aconteceu na primeira vez que rodei isto.
res2 = executar({"passos": [{"luzes": "naoexiste"}]},
                {"luzes": ClienteArtNet("127.0.0.1", 0, reenvio_segundos=0),
                 "looks": {}})
checar("erro claro, sem travar", res2[0]["estado"] == "erro", res2[0]["detalhe"])


print("\n[4] pacote Art-Net contra receptor local")
recebido = []
servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    servidor.bind(("127.0.0.1", 6454))
except OSError as erro:
    print("  PULADO  porta 6454 ocupada ({})".format(erro))
else:
    servidor.settimeout(3)
    threading.Thread(target=lambda: recebido.append(servidor.recvfrom(1024)[0]),
                     daemon=True).start()
    time.sleep(0.2)
    ClienteArtNet("127.0.0.1", 3, reenvio_segundos=0).aplicar({1: 255, 5: 128, 512: 7})
    time.sleep(0.4)

    checar("chegou um pacote", len(recebido) == 1)
    if recebido:
        p = recebido[0]
        checar("tamanho 530 bytes", len(p) == 530, str(len(p)))
        checar("header Art-Net", p[0:8] == b"Art-Net\x00")
        checar("opcode OpDmx 0x5000", p[8:10] == b"\x00\x50")
        checar("versao 14", int.from_bytes(p[10:12], "big") == 14)
        checar("sequencia comeca em 1", p[12] == 1, str(p[12]))
        checar("universo 3", int.from_bytes(p[14:16], "little") == 3)
        checar("length 512", int.from_bytes(p[16:18], "big") == 512)
        dmx = p[18:]
        checar("canal 1 = 255", dmx[0] == 255, str(dmx[0]))
        checar("canal 5 = 128", dmx[4] == 128, str(dmx[4]))
        checar("canal 512 = 7", dmx[511] == 7, str(dmx[511]))
        checar("canal nao citado fica 0", dmx[1] == 0)
servidor.close()


print("\n[5] validacao de faixa")
cliente = ClienteArtNet("127.0.0.1", 0, reenvio_segundos=0)
for canais, oque in [({0: 10}, "canal 0"), ({513: 10}, "canal 513"), ({1: 300}, "valor 300")]:
    try:
        cliente.aplicar(canais)
        checar("recusa " + oque, False)
    except ErroLuzes as erro:
        checar("recusa " + oque, True, str(erro))


print("\n[6] look invalida nao deixa valor orfao no quadro")
# Regressao de um bug real: aplicar() gravava canal por canal DENTRO do laco de
# validacao. Uma look {2: 50, 999: 50} gravava o canal 2, estourava no 999, e
# abortava o envio — mas o 50 ficava no quadro e saia no proximo disparo de
# QUALQUER outra look. Luz inexplicavel com dias de distancia da causa.
recebidos = []
servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    servidor.bind(("127.0.0.1", 6454))
except OSError as erro:
    print("  PULADO  porta 6454 ocupada ({})".format(erro))
else:
    servidor.settimeout(3)

    def escutar(quantos):
        for _ in range(quantos):
            try:
                recebidos.append(servidor.recvfrom(1024)[0])
            except socket.timeout:
                return

    ouvinte = threading.Thread(target=escutar, args=(2,), daemon=True)
    ouvinte.start()
    time.sleep(0.2)

    luz = ClienteArtNet("127.0.0.1", 0, reenvio_segundos=0)
    luz.aplicar({1: 100})                      # look boa: entra

    try:
        luz.aplicar({2: 50, 999: 50})          # look ruim: canal 999 invalido
        checar("look invalida levanta ErroLuzes", False, "nao levantou")
    except ErroLuzes:
        checar("look invalida levanta ErroLuzes", True)

    luz.aplicar({3: 10})                       # proxima look boa
    time.sleep(0.5)

    checar("so os envios validos sairam", len(recebidos) == 2, str(len(recebidos)))
    if len(recebidos) == 2:
        dmx = recebidos[-1][18:]
        checar("canal 1 preservado", dmx[0] == 100, str(dmx[0]))
        checar("canal 3 aplicado", dmx[2] == 10, str(dmx[2]))
        checar("canal 2 NAO vazou da look invalida", dmx[1] == 0,
               "" if dmx[1] == 0
               else "veio {} — o bug do valor orfao voltou".format(dmx[1]))
servidor.close()


print("\n[7] o token do Holyrics nunca aparece numa mensagem de erro")
# Regressao de um vazamento real, achado em 08/11: o requests poe a URL
# inteira dentro da excecao, e a URL leva ?token=... Com o Holyrics fechado,
# essa mensagem ia para a pilula de status do painel — que nao tem senha, numa
# rede com dezenas de aparelhos. Bastava o programa estar fechado para a
# credencial ser publicada.
SEGREDO = "TOKEN-SECRETO-DE-TESTE-9bX7"
# Porta 9 e o descarte do TCP/IP: nunca tem ninguem escutando, entao a conexao
# falha rapido e de forma previsavel, sem depender da rede da igreja.
cliente = ClienteHolyrics("127.0.0.1", 9, SEGREDO, timeout=1.0)
try:
    cliente.pedir("GetCurrentPresentation")
    checar("conexao morta levanta ErroHolyrics", False, "nao levantou")
except ErroHolyrics as erro:
    checar("conexao morta levanta ErroHolyrics", True)
    texto = str(erro)
    checar("a mensagem NAO traz o token", SEGREDO not in texto,
           "" if SEGREDO not in texto else "VAZOU: {}".format(texto))
    checar("a mensagem continua util", "Holyrics" in texto, texto[:70])
except Exception as erro:
    checar("conexao morta levanta ErroHolyrics", False,
           "veio {}: {}".format(type(erro).__name__, erro))


print("\n[8] o quadro e reenviado sozinho, sem ninguem mexer")
# Regressao de um problema achado contra o hardware real em 08/11: a ponte
# mandava UM pacote por aplicar() e calava. Art-Net nao tem confirmacao, entao
# um unico pacote perdido deixava a luz errada ate a proxima cue — que num
# culto pode ser quinze minutos depois. A propria Lumikit acusava: o LED de
# Art-Net pisca em erro quando o sinal para de chegar.
batidas = []
servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    servidor.bind(("127.0.0.1", 6454))
except OSError as erro:
    print("  PULADO  porta 6454 ocupada ({})".format(erro))
else:
    servidor.settimeout(0.4)

    def coletar(ate):
        while time.time() < ate:
            try:
                batidas.append(servidor.recvfrom(1024)[0])
            except socket.timeout:
                continue

    # Universo 9 so para este bloco: se algum cliente de outro teste ainda
    # estiver vivo, os pacotes dele sao de outro universo e ficam de fora.
    UNIVERSO_DESTE_TESTE = 9

    def meu(pacote):
        return int.from_bytes(pacote[14:16], "little") == UNIVERSO_DESTE_TESTE

    # A THREAD NAO PODE MANDAR NADA AO NASCER. Se mandar, e um quadro vazio —
    # em producao, um PACOTE DE APAGAO no instante em que a ponte sobe. Este
    # teste existe porque a primeira versao fazia exatamente isso, e eu
    # tinha "consertado" DRENANDO a fila no teste, que e tratar o sintoma e
    # deixar o defeito em pe.
    luz = ClienteArtNet("127.0.0.1", UNIVERSO_DESTE_TESTE, reenvio_segundos=0.6)
    try:
        time.sleep(0.25)
        precoces = []
        servidor.settimeout(0.05)
        while True:
            try:
                p = servidor.recvfrom(1024)[0]
            except socket.timeout:
                break
            if meu(p):
                precoces.append(p)
        checar("nao manda quadro ao nascer", not precoces,
               "{} pacote(s) antes do primeiro aplicar()".format(len(precoces)))

        servidor.settimeout(0.4)
        luz.aplicar({7: 123})
        ouvinte = threading.Thread(target=coletar, args=(time.time() + 2.4,), daemon=True)
        ouvinte.start()
        ouvinte.join(timeout=4)
    finally:
        luz.parar()
    batidas = [p for p in batidas if meu(p)]

    checar("chegou mais de um pacote sem novo aplicar()", len(batidas) >= 3,
           "{} pacotes em 1,5s".format(len(batidas)))
    if batidas:
        checar("todo reenvio carrega o mesmo quadro",
               all(p[18:][6] == 123 for p in batidas),
               "canal 7 variou entre os pacotes")
        sequencias = [p[12] for p in batidas]
        checar("a sequencia avanca a cada envio",
               len(set(sequencias)) == len(sequencias) or len(sequencias) > 255,
               str(sequencias[:6]))

    # Depois de parar(), o reenvio tem MESMO que cessar: senao a thread fica
    # mandando pacote para sempre e o processo nao morre direito.
    depois = []
    servidor.settimeout(0.4)
    fim = time.time() + 1.0
    while time.time() < fim:
        try:
            p = servidor.recvfrom(1024)[0]
        except socket.timeout:
            continue
        if meu(p):
            depois.append(p)
    checar("parar() interrompe o reenvio", not depois,
           "ainda chegaram {} pacotes deste universo depois de parar()".format(len(depois)))
servidor.close()


print("\n[9] modos de movimento")
# Tres coisas aqui sao de SEGURANCA, nao de estetica, e por isso sao testadas
# contra TODOS os modos e ao longo de um ciclo inteiro, nao num instante:
#   - a luz de frente nunca se mexe (e ela que a camera usa no rosto)
#   - o facho nunca sai dos limites de pan/tilt configurados
#   - so o modo marcado `perigoso` escreve na faixa de estrobo
motor = Movimento(cfg.get("grupos_de_luz") or {}, cfg.get("movimentos") or {})
catalogo = motor.catalogo()
checar("os modos carregaram", len(catalogo) > 0, "{} modos".format(len(catalogo)))
checar("vem ordenado por energia",
       [m["energia"] for m in catalogo] == sorted(m["energia"] for m in catalogo),
       str([m["id"] for m in catalogo]))
perigosos = [m["id"] for m in catalogo if m["perigoso"]]
checar("so o estrobo e marcado perigoso", perigosos == ["estrobo"], str(perigosos))

# Cena de partida: tudo aceso, para o modo ter o que modular.
CENA = bytearray(512)
for c in (1, 2, 3, 4, 17, 18, 19, 20, 33, 34, 35, 36):
    CENA[c - 1] = 200
for base in (49, 65, 81, 97):
    CENA[base - 1] = 200            # brilho da cortina
    CENA[base + 4 - 1] = 255        # vermelho
for base in (113, 129, 145):
    CENA[base - 1] = 128            # pan
    CENA[base + 1 - 1] = 128        # tilt
    CENA[base + 2 - 1] = 255        # obturador aberto

FRENTE = [1, 2, 3, 4]
OBTURADORES_T = [115, 131, 147]
ESTROBO_C = [50, 66, 82, 98]

def limites_do_modo(nome):
    """Le os limites do PROPRIO config, em vez de repetir numeros aqui.

    A primeira versao cravava 90-170 no teste. Quando o Paulo pediu circulos
    maiores e eu abri os limites no config, o teste reprovou codigo que
    estava certo — ele tinha virado ancora do valor antigo em vez de guarda
    da regra. A regra e "o facho respeita o cerco configurado", nao "o facho
    fica entre 90 e 170".
    """
    pmin, pmax, tmin, tmax = 255, 0, 255, 0
    achou = False
    for efeito in (cfg.get("movimentos") or {}).get(nome, {}).get("efeitos") or []:
        if efeito.get("grupo") != "teto" or efeito.get("tipo") not in ("circulo", "pendulo"):
            continue
        achou = True
        pmin = min(pmin, int(efeito.get("pan_min", 0)))
        pmax = max(pmax, int(efeito.get("pan_max", 255)))
        tmin = min(tmin, int(efeito.get("tilt_min", 0)))
        tmax = max(tmax, int(efeito.get("tilt_max", 255)))
    return (pmin, pmax, tmin, tmax) if achou else None


for modo in catalogo:
    motor.escolher(modo["id"])
    frente_mexeu = False
    fora_do_limite = []
    estrobou = False
    cerco = limites_do_modo(modo["id"])
    for passo in range(240):                 # dois ciclos do modo mais lento
        quadro = motor.aplicar(bytearray(CENA), passo * 0.25)
        if any(quadro[c - 1] != CENA[c - 1] for c in FRENTE):
            frente_mexeu = True
        if cerco:
            pmin, pmax, tmin, tmax = cerco
            for base in (113, 129, 145):
                if not pmin <= quadro[base - 1] <= pmax:
                    fora_do_limite.append(("pan", base, quadro[base - 1]))
                if not tmin <= quadro[base + 1 - 1] <= tmax:
                    fora_do_limite.append(("tilt", base, quadro[base + 1 - 1]))
        if any(140 <= quadro[c - 1] <= 250 for c in OBTURADORES_T):
            estrobou = True
        if any(quadro[c - 1] >= 20 for c in ESTROBO_C):
            estrobou = True

    checar("'{}' nao toca na luz de frente".format(modo["id"]), not frente_mexeu)
    checar("'{}' respeita os limites do facho".format(modo["id"]), not fora_do_limite,
           str(fora_do_limite[:3]))
    checar("'{}' estroba so se for o modo perigoso".format(modo["id"]),
           estrobou == modo["perigoso"],
           "estrobou={} perigoso={}".format(estrobou, modo["perigoso"]))

print("\n[9b] 'parado' devolve a cena intacta")
motor.escolher("celebracao")
modulado = motor.aplicar(bytearray(CENA), 3.7)
checar("com modo, o quadro muda", bytes(modulado) != bytes(CENA))
motor.escolher("parado")
checar("sem modo, e identico", bytes(motor.aplicar(bytearray(CENA), 3.7)) == bytes(CENA))
checar("atual() volta a None", motor.atual() is None, str(motor.atual()))

print("\n[9c] cena apagada: nada acende e nenhum motor gira")
# Duas coisas diferentes, e as duas importam.
# Acender: se um modo pudesse acender canal em zero, um refletor que a equipe
# desligou de proposito voltaria sozinho no meio do culto.
# Girar: um modo esquecido ligado faria as cabecas rodarem no escuro —
# barulho de motor durante a oracao, e desgaste sem nenhum efeito visivel.
APAGADA = bytearray(512)
motor.escolher("celebracao")
mexeu_algo = False
for passo in range(80):
    q = motor.aplicar(bytearray(APAGADA), passo * 0.25)
    if bytes(q) != bytes(APAGADA):
        mexeu_algo = True
        break
checar("cena apagada sai intacta, inclusive pan e tilt", not mexeu_algo)

print("\n[9d] cabeca apagada nao gira, mesmo com as outras acesas")
MISTA = bytearray(CENA)
MISTA[115 - 1] = 0            # fecha o obturador so da primeira cabeca
motor.escolher("celebracao")
parada = all(motor.aplicar(bytearray(MISTA), p * 0.25)[113 - 1] == MISTA[113 - 1]
             and motor.aplicar(bytearray(MISTA), p * 0.25)[114 - 1] == MISTA[114 - 1]
             for p in range(60))
outra_anda = any(motor.aplicar(bytearray(MISTA), p * 0.25)[129 - 1] != MISTA[129 - 1]
                 for p in range(60))
checar("a apagada ficou parada", parada)
checar("as outras continuam girando", outra_anda)
motor.escolher("parado")


print("\n[10] o seguidor saneia o que chega pela rede")
# No modo agente o quadro chega PELA REDE, de um painel sem senha, numa rede
# onde foram contados quase cem aparelhos. Confiar em quem mandou seria errado
# por construcao: este e o ponto em que o dado vira luz, e e aqui que ele e
# conferido. A excecao e o modo perigoso — e quem decide se um nome de modo e
# perigoso e o config DESTA maquina, nunca o que veio no fio.
SANEAMENTO = {
    "sempre_zero": [50, 66, 82, 98, 51, 67, 83, 99, 52, 68, 84, 100,
                    120, 121, 136, 137, 152, 153],
    "so_estes_valores": {115: [0, 128, 255], 131: [0, 128, 255], 147: [0, 128, 255]},
}
vigia = Seguidor("http://127.0.0.1:1", None,
                 movimento=Movimento(cfg.get("grupos_de_luz") or {},
                                     cfg.get("movimentos") or {}),
                 saneamento=SANEAMENTO)

MALICIOSO = {c: 0 for c in range(1, 513)}
MALICIOSO[50] = 200      # estrobo da cortina
MALICIOSO[51] = 128      # programa automatico
MALICIOSO[121] = 255     # reset de uma cabeca
MALICIOSO[115] = 190     # obturador na faixa de estrobo
MALICIOSO[53] = 255      # vermelho legitimo, tem que passar

limpo, barrados = vigia._sanear(dict(MALICIOSO))
checar("barrou o estrobo da cortina", limpo[50] == 0, str(limpo[50]))
checar("barrou o programa automatico", limpo[51] == 0, str(limpo[51]))
checar("barrou o reset da cabeca", limpo[121] == 0, str(limpo[121]))
checar("fechou o obturador fora da faixa segura", limpo[115] == 0, str(limpo[115]))
checar("deixou a cor legitima passar", limpo[53] == 255, str(limpo[53]))
checar("relatou o que barrou", len(barrados) == 4, str(barrados))

print("\n[10b] a rede NUNCA carrega estrobo, nem com o modo perigoso ativo")
# Correcao de uma brecha real: a primeira versao liberava o quadro inteiro
# quando o modo era perigoso. O NOME era validado aqui, mas o VALOR ainda
# vinha de fora — bastava mandar os dois juntos. Hoje o quadro e saneado
# sempre, e quem escreve na faixa de estrobo e so o motor local, a partir do
# `valor` do config DESTA maquina. Autorizacao e valor, os dois locais.
motor_local = Movimento(cfg.get("grupos_de_luz") or {}, cfg.get("movimentos") or {})
vigia2 = Seguidor("http://127.0.0.1:1", None, movimento=motor_local,
                  saneamento=SANEAMENTO)
limpo2, barrados2 = vigia2._sanear(dict(MALICIOSO))
checar("o valor do fio e barrado de qualquer forma",
       limpo2[50] == 0 and limpo2[115] == 0,
       "estrobo={} obturador={}".format(limpo2[50], limpo2[115]))

# E o estrobo de verdade ainda funciona, vindo do motor local sobre uma cena
# legitima — senao a correcao teria quebrado o recurso.
CENA_T = bytearray(512)
CENA_T[113 - 1] = 128
CENA_T[115 - 1] = 255     # obturador aberto pela cena
CENA_T[116 - 1] = 200
motor_local.escolher("estrobo")
com_estrobo = motor_local.aplicar(bytearray(CENA_T), 0.5)
checar("o motor local ainda produz o estrobo",
       140 <= com_estrobo[115 - 1] <= 250, str(com_estrobo[115 - 1]))
motor_local.escolher("parado")


print("\n" + "-" * 60)
print("FALHAS: {}".format(len(falhas)) + ("  -> " + ", ".join(falhas) if falhas else ""))
sys.exit(1 if falhas else 0)
