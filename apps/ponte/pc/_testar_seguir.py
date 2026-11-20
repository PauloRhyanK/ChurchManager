"""Testes do SEGUIR (a luz do teto acompanhando alguem) e do video em fluxo.

    python _testar_seguir.py

Rodam sem OBS, sem luz e sem servidor. As contas e o motor rodam sem
OpenCV; a parte do app e do detector precisa dele (requirements-seguir.txt)
e e pulada, com aviso, se ele faltar.
"""

import json
import os
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from ponte import movimento, obs_imagem, rastreio, seguidor   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


# -- a conta ------------------------------------------------------------------
print("\nCalibracao: da imagem ao pan/tilt")


def projetar(x, y):
    """Um mapa projetivo qualquer, que a calibracao precisa redescobrir."""
    w = 0.2 * x + 0.1 * y + 1.0
    return ((60 + 120 * x + 10 * y) / w, (70 + 15 * x + 90 * y) / w)


pontos = []
for x, y in [(0.1, 0.5), (0.9, 0.55), (0.15, 0.95), (0.85, 0.9), (0.5, 0.7)]:
    pan, tilt = projetar(x, y)
    pontos.append({"x": x, "y": y, "pan": pan, "tilt": tilt})
mapa = rastreio.Mapa(pontos)
pan, tilt = mapa.aplicar(0.4, 0.8)
esperado = projetar(0.4, 0.8)
conferir("homografia acerta um ponto que nao foi medido",
         abs(pan - esperado[0]) < 0.5 and abs(tilt - esperado[1]) < 0.5, (pan, tilt, esperado))
conferir("e diz que e homografia, com desvio quase zero", mapa.tipo == "homografia" and mapa.erro < 0.5, mapa.erro)
pan, tilt = mapa.aplicar(0.0, 0.0)
conferir("fora do palco calibrado, fica presa perto do que foi medido",
         mapa.cerca[0] <= pan <= mapa.cerca[1] and mapa.cerca[2] <= tilt <= mapa.cerca[3], (pan, tilt, mapa.cerca))
afim = rastreio.Mapa(pontos[:3])
conferir("com 3 pontos, usa a conta afim", afim.tipo == "afim")
try:
    rastreio.Mapa(pontos[:2])
    conferir("com 2 pontos recusa", False)
except rastreio.ErroRastreio:
    conferir("com 2 pontos recusa", True)
try:
    rastreio.Mapa([{"x": i / 10, "y": i / 10, "pan": 10 * i, "tilt": 10 * i} for i in range(4)])
    conferir("pontos todos em linha recusam", False)
except rastreio.ErroRastreio:
    conferir("pontos todos em linha recusam", True)

pasta = tempfile.mkdtemp()
cal = rastreio.Calibracao(os.path.join(pasta, "cal.json"))
for p in pontos[:4]:
    cal.acrescentar(113, p["x"], p["y"], round(p["pan"]), round(p["tilt"]))
cal2 = rastreio.Calibracao(os.path.join(pasta, "cal.json"))
conferir("a calibracao fica gravada em arquivo", len(cal2.pontos(113)) == 4 and 113 in cal2.mapas())
try:
    cal.acrescentar(113, 1.5, 0.2, 10, 10)
    conferir("ponto fora da imagem recusa", False)
except rastreio.ErroRastreio:
    conferir("ponto fora da imagem recusa", True)


# -- o alvo -------------------------------------------------------------------
print("\nAlvo: quem a luz segue")
relogio = [100.0]
alvo = rastreio.Alvo(agora=lambda: relogio[0])
pessoas = [{"caixa": [0.1, 0.2, 0.2, 0.8], "nota": 0.9}, {"caixa": [0.6, 0.3, 0.7, 0.9], "nota": 0.8}]
conferir("clique fora de qualquer pessoa nao escolhe ninguem", not alvo.escolher(pessoas, 0.4, 0.1))
conferir("clique na pessoa escolhe ela", alvo.escolher(pessoas, 0.65, 0.5) and alvo.caixa == [0.6, 0.3, 0.7, 0.9])
relogio[0] += 0.2
alvo.atualizar([{"caixa": [0.62, 0.3, 0.72, 0.9], "nota": 0.8}, pessoas[0]])
conferir("acompanha a mesma pessoa andando", alvo.caixa == [0.62, 0.3, 0.72, 0.9] and alvo.situacao() == "seguindo")
conferir("o pe amacia em vez de saltar", 0.65 < alvo.pes[0] < 0.67, alvo.pes)
relogio[0] += 2.0
alvo.atualizar([pessoas[0]])
conferir("a outra pessoa nao rouba o alvo", alvo.caixa == [0.62, 0.3, 0.72, 0.9])
conferir("sumiu por 2 s: perdido", alvo.situacao() == "perdido")


# -- o motor ------------------------------------------------------------------
print("\nMotor: a cabeca anda ate o alvo, devagar e dentro dos limites")
GRUPOS = {"teto": {"bases": [113, 129], "pan": 0, "tilt": 1, "obturador": 2},
          "cortina": {"bases": [49], "brilho": 0}}
motor = movimento.Movimento(GRUPOS, {"lento": {"efeitos": []}})
motor.configurar_seguir({"tilt_max": 200})
cena = bytearray(512)
for base in (113, 129):
    cena[base - 1], cena[base], cena[base + 1] = 100, 100, 255    # pan, tilt, obturador aceso
cena[129 + 1] = 0                                                 # a 129 esta apagada

limpo = motor.definir_seguir({"alvos": {"113": [180, 250], "129": [180, 180], "49": [0, 0], "999": [1, 1]}})
conferir("so cabeca movel do config local entra", set(limpo) == {"113", "129"}, limpo)
conferir("o tilt e preso na cerca local", limpo["113"][1] == 200, limpo)
conferir("o seguir conta como movimento ativo", motor.ativo())

saidas = [motor.aplicar(bytearray(cena), t / 30.0) for t in range(0, 300)]
passos = [abs(b[112] - a[112]) for a, b in zip(saidas, saidas[1:])]
conferir("nunca anda mais que o freio por quadro", max(passos) <= motor.SEGUIR_VELOCIDADE / 30.0 + 1, max(passos))
conferir("e chega no alvo", abs(saidas[-1][112] - 180) <= 1 and abs(saidas[-1][113] - 200) <= 1,
         (saidas[-1][112], saidas[-1][113]))
conferir("cabeca apagada nao se mexe", saidas[-1][128] == 100 and saidas[-1][129] == 100)
conferir("a cor e o obturador nao mudam", saidas[-1][114] == 255)

motor.definir_seguir({"alvos": {"113": [120, 120]}})
depois = motor.aplicar(bytearray(cena), 300 / 30.0 + 1 / 30.0)
conferir("alvo novo nao recomeca do zero: parte de onde estava", abs(depois[112] - 180) <= 5, depois[112])
motor.escolher("lento")
conferir("ligar um modo do culto desliga o seguir", motor.seguir() is None)
motor.definir_seguir({"alvos": {"113": [120, 120]}})
motor.escolher(None)
conferir("Parado desliga o seguir", motor.seguir() is None and not motor.ativo())
conferir("alvo invalido desliga", motor.definir_seguir({"alvos": {"113": ["x", 1]}}) is None and motor.seguir() is None)


# -- o seguidor (PC do som) ---------------------------------------------------
print("\nSeguidor: o alvo atravessa a rede e o motor de la confere")


class LuzDeMentira:
    def __init__(self):
        self.aplicados = 0

    def aplicar(self, quadro):
        self.aplicados += 1


luz = LuzDeMentira()
motor_la = movimento.Movimento(GRUPOS, {})
seg = seguidor.Seguidor("http://x", luz, movimento=motor_la, aviso=lambda *_: None)
base_corpo = {"versao": 7, "modo": "parado", "canais": {"113": 100}}
seg._aplicar(dict(base_corpo, seguir={"alvos": {"113": [150, 140]}}))
conferir("o alvo chega no motor de la", motor_la.seguir() == {"alvos": {"113": [150.0, 140.0]}}, motor_la.seguir())
seg._aplicar(dict(base_corpo, seguir={"alvos": {"113": [160, 140]}}))
conferir("alvo novo nao reaplica a cena inteira", luz.aplicados == 1, luz.aplicados)
conferir("mas atualiza o alvo", motor_la.seguir()["alvos"]["113"] == [160.0, 140.0])
conferir("e busca mais rapido enquanto segue", seg._seguindo)
seg._aplicar(dict(base_corpo))
conferir("sem a chave seguir, o seguir para", motor_la.seguir() is None and not seg._seguindo)


# -- o fluxo de video ---------------------------------------------------------
print("\nVideo em fluxo (MJPEG)")
fotos = [b"A", b"A", b"B", None, b"C"]
estado = {"i": 0, "t": 0.0}


def pegar():
    i = min(estado["i"], len(fotos) - 1)
    estado["i"] += 1
    return fotos[i], "image/jpeg", 0.1


def dormir(s):
    estado["t"] += s


fotos[1] = fotos[0]     # o MESMO objeto: foto que nao mudou nao sai de novo
partes = list(obs_imagem.fluxo_mjpeg(pegar, 0.2, duracao=1.0, agora=lambda: estado["t"], dormir=dormir))
conferir("comeca com a fronteira", partes[0] == b"--quadro\r\n")
conferir("so manda foto nova", [p.split(b"\r\n\r\n", 1)[1][:1] for p in partes[1:]] == [b"A", b"B", b"C"], partes)
conferir("cada foto termina com a fronteira (o navegador desenha na hora)",
         all(p.endswith(b"\r\n--quadro\r\n") for p in partes[1:]))
conferir("e acaba sozinho", estado["t"] >= 1.0)


# -- o app, ponta a ponta (precisa de OpenCV) ----------------------------------
try:
    import cv2      # noqa: F401
    import numpy as np
    TEM_CV = True
except Exception:
    TEM_CV = False
    print("\n[pulado] app e detector: sem OpenCV neste Python")

if TEM_CV:
    print("\nDetector")
    if hasattr(cv2, "HOGDescriptor"):
        det = rastreio.montar_detector({"modelo": "nao-existe.onnx"}, AQUI)
        conferir("sem o modelo YOLO, cai no detector simples", det.nome == "hog")
        conferir("e roda numa imagem sem ninguem", det.detectar(np.zeros((240, 416, 3), dtype=np.uint8)) == [])
        ruido = np.random.default_rng(1).integers(0, 255, (90, 160, 3), dtype=np.uint8)
        conferir("imagem menor que a janela do HOG nao derruba nada", isinstance(det.detectar(ruido), list))
    else:
        try:
            rastreio.montar_detector({"modelo": "nao-existe.onnx"}, AQUI)
            conferir("OpenCV sem HOG e sem modelo: diz o que falta", False)
        except rastreio.ErroRastreio as erro:
            conferir("OpenCV sem HOG e sem modelo: diz o que falta", "requirements-seguir" in str(erro))

    conferir("o modelo YOLOX vem junto e e o padrao", rastreio.montar_detector({}, AQUI).nome == "yolox")

    class RedeDeMentira:
        """Responde como o YOLOX nano: 1 x 3549 x 85, crua (antes da grade)."""
        def setInput(self, blob):
            self.forma = blob.shape

        def forward(self):
            saida = np.zeros((1, 3549, 85), dtype=np.float32)
            celula = 15 * 52 + 20                      # grade de passo 8, coluna 20, linha 15
            saida[0, celula, :6] = [0.5, 0.5, np.log(8), np.log(12), 0.9, 1.0]       # pessoa 64 x 96
            saida[0, celula + 1, :6] = [0.5, 0.5, np.log(8), np.log(12), 0.8, 1.0]   # a mesma, ao lado
            saida[0, celula + 2, :5] = [0.5, 0.5, 1, 1, 0.95]                        # objeto que
            saida[0, celula + 2, 5 + 5] = 1.0                                        # e onibus
            return saida

    yolox = object.__new__(rastreio.DetectorYolox)
    yolox._rede, yolox._confianca = RedeDeMentira(), 0.4
    yolox._montar_grade()
    achou = yolox.detectar(np.zeros((360, 640, 3), dtype=np.uint8))
    conferir("YOLOX: so pessoas, sem repetir", len(achou) == 1, achou)
    esperado = [0.3173, 0.3248, 0.4712, 0.735]
    conferir("YOLOX: a caixa sai da grade e volta para a imagem original",
             achou and all(abs(a - b) < 0.002 for a, b in zip(achou[0]["caixa"], esperado)), achou)
    conferir("YOLOX: a rede recebe 416 x 416", yolox._rede.forma == (1, 3, 416, 416), yolox._rede.forma)

    print("\nApp: rotas do seguir, no modo simulado")
    import yaml
    with open(os.path.join(AQUI, "config.exemplo.yaml"), encoding="utf-8") as arquivo:
        conf = yaml.safe_load(arquivo)
    conf["seguir"] = {"fonte": "Câmera aberta", "grupo": "teto", "fps": 8}
    caminho_conf = os.path.join(pasta, "config.yaml")
    with open(caminho_conf, "w", encoding="utf-8") as arquivo:
        yaml.safe_dump(conf, arquivo, allow_unicode=True)
    os.environ.update({"PONTE_SIMULAR": "1", "PONTE_CONFIG": caminho_conf, "PONTE_DADOS": pasta,
                       "PONTE_HTTP": "1"})
    os.environ.setdefault("PONTE_SENHA", "senha-de-teste")
    os.environ.setdefault("PONTE_CHAVE", "chave-de-teste-com-mais-de-24-letras")

    import app as ponte                     # noqa: E402
    from ponte import simulados             # noqa: E402

    class DetectorDeMentira:
        nome = "teste"
        caixas = [{"caixa": [0.4, 0.3, 0.5, 0.9], "nota": 0.9}]

        def detectar(self, imagem):
            return [dict(c) for c in self.caixas]

    ponte.CAMINHO_SEGUIR = os.path.join(pasta, "_seguir_calibracao.json")
    ponte.CAMINHO_SEGUIR_LIGADO = os.path.join(pasta, "_seguir.json")
    for nome in ("CAMINHO_PONTEIRO", "CAMINHO_LOUVOR", "CAMINHO_MARCAS"):
        setattr(ponte, nome, os.path.join(pasta, nome + ".json"))
    ponte._config = ponte.carregar_config()
    ponte._contexto = ponte.montar_contexto(ponte._config)
    OBS = simulados.ObsSimulado()
    ponte._contexto["obs"] = ponte._contexto["obs_saude"] = OBS
    ponte._estado["obs"] = ponte._ler_estado_obs()
    ponte._pecas["seguir_detector"] = DetectorDeMentira()
    ponte._ao_vivo["valor"] = ponte._montar_ao_vivo()
    cliente = ponte.app.test_client()

    print("\nPainel: o Seguir vem desligado e liga num botao")
    conferir("vem desligado: nada monta, nada captura", ponte._pecas["seguir"] is None)
    luz = cliente.get("/api/painel").get_json()["luz"]
    conferir("o cartao da Luz oferece ligar", luz.get("seguir_pessoa") == {"estado": "desligado"}, luz.get("seguir_pessoa"))
    r = cliente.get("/api/seguir").get_json()
    conferir("a tela /seguir tambem oferece ligar", not r["disponivel"] and r["pode_ligar"], r)
    corpo, codigo = ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    rast = ponte._pecas["seguir"]
    conferir("o botao do painel liga e prepara", codigo == 200 and rast is not None and rast.seguindo, corpo)
    conferir("e a escolha fica gravada para depois de religar",
             json.load(open(ponte.CAMINHO_SEGUIR_LIGADO))["ligado"] is True)
    rast.parar()        # o teste anda o laco na mao, com rast.passo()
    luz = cliente.get("/api/painel").get_json()["luz"]
    conferir("ligado sem calibrar, o cartao diz o que falta",
             luz["seguir_pessoa"]["estado"] == "falta_calibrar", luz["seguir_pessoa"])

    r = cliente.get("/api/seguir").get_json()
    conferir("o seguir esta disponivel", r["disponivel"] and r["detector"] == "teste", r)
    conferir("as luzes sao as do teto", [l["endereco"] for l in r["luzes"]] == [113, 129, 145], r["luzes"])
    rast.passo()
    r = cliente.get("/api/seguir").get_json()
    conferir("depois de uma foto, acha a pessoa", len(r["pessoas"]) == 1, r["pessoas"])
    conferir("e tem imagem marcada para a tela", rast.imagem()[0][:2] == b"\xff\xd8")
    conferir("sem calibrar, a luz nao recebe alvo", "seguir" not in cliente.get("/api/luz/quadro").get_json())
    conferir("com uma pessoa so, ela vira o alvo sozinha", rast.alvo.situacao() == "seguindo")
    rast.soltar()
    conferir("clique no vazio nao escolhe", cliente.post("/api/seguir/escolher", json={"x": 0.05, "y": 0.05}).status_code == 404)
    conferir("clique na pessoa escolhe", cliente.post("/api/seguir/escolher", json={"x": 0.45, "y": 0.5}).status_code == 200)

    resp = cliente.post("/api/seguir/mirar", json={"endereco": 113, "pan": 90, "tilt": 120})
    canais = ponte._contexto["luzes"].retrato()["canais"]
    conferir("mirar mexe so o pan e o tilt daquela luz", resp.status_code == 200
             and canais.get("113") == 90 and canais.get("114") == 120, (resp.get_json(), canais))
    conferir("e calibrar desliga o Seguir", not rast.seguindo
             and json.load(open(ponte.CAMINHO_SEGUIR_LIGADO))["ligado"] is False)
    conferir("mirar em luz de fora do grupo recusa",
             cliente.post("/api/seguir/mirar", json={"endereco": 49, "pan": 1, "tilt": 1}).status_code == 400)

    resp = cliente.post("/api/seguir/ponto", json={"endereco": 113, "x": 0.45, "y": 0.5, "pan": 90, "tilt": 120})
    conferir("clique na pessoa grava o PE dela", resp.status_code == 200
             and resp.get_json()["ponto"] == {"x": 0.45, "y": 0.9}, resp.get_json())
    for x, y, pan, tilt in [(0.1, 0.6, 60, 110), (0.9, 0.6, 190, 110), (0.2, 0.95, 70, 160)]:
        cliente.post("/api/seguir/ponto", json={"endereco": 113, "x": x, "y": y, "pan": pan, "tilt": tilt})
    r = cliente.get("/api/seguir").get_json()
    conferir("com 4 pontos a luz fica calibrada", r["luzes"][0]["calibrada"] and r["luzes"][0]["conta"] == "homografia",
             r["luzes"][0])

    conferir("liga o seguir", cliente.post("/api/seguir/ligar", json={"ligar": True}).get_json()["seguindo"] is True)
    DetectorDeMentira.caixas = [{"caixa": [0.42, 0.3, 0.52, 0.9], "nota": 0.9}]
    rast.passo()
    quadro = cliente.get("/api/luz/quadro").get_json()
    conferir("o quadro que o PC do som busca leva o alvo", "seguir" in quadro
             and list(quadro["seguir"]["alvos"]) == ["113"], quadro.get("seguir"))
    alvo_antes = quadro["seguir"]["alvos"]["113"]
    DetectorDeMentira.caixas = []
    rast.passo()
    rast.alvo.visto_em -= 10
    rast.passo()
    quadro = cliente.get("/api/luz/quadro").get_json()
    conferir("perdeu a pessoa: o alvo fica onde estava", quadro["seguir"]["alvos"]["113"] == alvo_antes)
    conferir("desliga o seguir", cliente.post("/api/seguir/ligar", json={"ligar": False}).get_json()["seguindo"] is False)
    conferir("e o quadro deixa de levar o alvo", "seguir" not in cliente.get("/api/luz/quadro").get_json())

    print("\nApp: o painel recebe a imagem em fluxo")
    resp = cliente.get("/api/painel/video", buffered=False)
    conferir("responde como fluxo MJPEG", resp.status_code == 200
             and resp.mimetype == "multipart/x-mixed-replace", resp.mimetype)
    pedacos = resp.response
    primeiro, segundo = next(pedacos), next(pedacos)
    conferir("e a primeira foto vem logo", primeiro == b"--quadro\r\n" and b"Content-Type: image/" in segundo)
    resp.close()

if TEM_CV:
    print("\nCamera achada sozinha no OBS")
    conferir("so a camera de verdade conta", rastreio.cameras_do_obs(OBS) == ["Câmera aberta"])
    cal_auto = rastreio.Calibracao(os.path.join(pasta, "_auto.json"))
    auto = rastreio.Rastreador(OBS, "", DetectorDeMentira(), ponte._contexto.get("movimento"), cal_auto, [113])
    auto.passo()
    conferir("com uma camera so, escolhe ela e guarda", auto.fonte == "Câmera aberta"
             and rastreio.Calibracao(os.path.join(pasta, "_auto.json")).fonte() == "Câmera aberta")
    cal_auto.acrescentar(113, 0.5, 0.5, 100, 100)
    OBS.entradas = [("Câmera aberta", "dshow_input"), ("Câmera do púlpito", "dshow_input")]
    auto.escolher_camera("Câmera do púlpito")
    conferir("trocar de camera apaga a calibracao", auto.fonte == "Câmera do púlpito" and cal_auto.pontos(113) == [])
    try:
        auto.escolher_camera("Não existe")
        conferir("camera que o OBS nao tem recusa", False)
    except rastreio.ErroRastreio:
        conferir("camera que o OBS nao tem recusa", True)
    sem = rastreio.Rastreador(OBS, "", DetectorDeMentira(), None,
                              rastreio.Calibracao(os.path.join(pasta, "_sem.json")), [113])
    try:
        sem.passo()
        conferir("com duas cameras e nenhuma escolhida, pede para escolher", False)
    except rastreio.ErroRastreio as erro:
        conferir("com duas cameras e nenhuma escolhida, pede para escolher", "escolha" in str(erro), erro)
    r = cliente.get("/api/seguir").get_json()
    conferir("a tela recebe a lista de cameras", r["cameras"] == ["Câmera aberta", "Câmera do púlpito"], r.get("cameras"))
    conferir("e sabe que a do config e fixa", r["fonte_fixa"] is True)
    conferir("camera fixa no config nao troca pela tela",
             cliente.post("/api/seguir/camera", json={"nome": "Câmera do púlpito"}).status_code == 400)
    OBS.entradas = simulados.ObsSimulado.entradas

    print("\nPainel do culto: ver e parar a luz seguindo")
    for x, y, pan, tilt in [(0.45, 0.9, 90, 120), (0.1, 0.6, 60, 110), (0.9, 0.6, 190, 110), (0.2, 0.95, 70, 160)]:
        rast.calibracao.acrescentar(113, x, y, pan, tilt)
    rast.recalibrou()
    DetectorDeMentira.caixas = [{"caixa": [0.4, 0.3, 0.5, 0.9], "nota": 0.9}]
    ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    rast.passo()
    luz = cliente.get("/api/painel").get_json()["luz"]
    conferir("o painel mostra que a luz segue alguem", luz["seguir_pessoa"] == {"estado": "seguindo"}, luz["seguir_pessoa"])
    corpo, codigo = ponte._acao_do_painel({"tipo": "parar_seguir"}, "local")
    conferir("Parar de seguir no painel desliga", codigo == 200 and not rast.seguindo
             and ponte._contexto["movimento"].seguir() is None, corpo)
    conferir("e o cartao volta a oferecer ligar",
             cliente.get("/api/painel").get_json()["luz"]["seguir_pessoa"] == {"estado": "desligado"})
    ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    rast.passo()
    ponte._acao_do_painel({"tipo": "modo_luz", "modo": "parado"}, "local")
    rast.passo()
    conferir("Parado no painel para de verdade (a foto seguinte nao religa)",
             ponte._contexto["movimento"].seguir() is None and not rast.seguindo)
    ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    rast.passo()
    cliente.post("/api/luz/modo/lento")
    rast.passo()
    conferir("um modo do culto tambem desliga o Seguir", ponte._contexto["movimento"].atual() == "lento"
             and not rast.seguindo)
    ponte._contexto["movimento"].escolher(None)
    with open(os.path.join(AQUI, "..", "web", "app.py"), encoding="utf-8") as arquivo:
        web = arquivo.read()
    conferir("a web aceita ligar e parar", '"seguir_ligar", "parar_seguir"' in web)

    print("\nPreparar na primeira vez, e o bloqueio do config")
    ponte._acao_do_painel({"tipo": "parar_seguir"}, "local")
    rast.parar()
    ponte._pecas["seguir"] = None
    ponte._pecas.pop("seguir_detector", None)
    chamadas = []
    original = rastreio.montar_detector
    rastreio.montar_detector = lambda conf, raiz: (_ for _ in ()).throw(rastreio.FaltaOpenCV("falta"))
    instalar_original = ponte._instalar_opencv
    ponte._instalar_opencv = lambda cliente=None: chamadas.append(cliente)
    ponte.SIMULAR = False
    ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    import time as _t
    _t.sleep(0.2)
    conferir("sem OpenCV, ligar comeca a instalar", len(chamadas) == 1)
    conferir("e o cartao mostra 'preparando'",
             cliente.get("/api/painel").get_json()["luz"]["seguir_pessoa"] == {"estado": "preparando"})
    ponte._instalando_opencv["rodando"] = False
    ponte._pecas["seguir_motivo"] = "não consegui instalar (sem internet)"
    estado = cliente.get("/api/painel").get_json()["luz"]["seguir_pessoa"]
    conferir("se falhar, o cartao diz o motivo", estado["estado"] == "erro" and "internet" in estado["motivo"], estado)
    ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    _t.sleep(0.2)
    conferir("tocar em ligar de novo tenta de novo", len(chamadas) == 2)
    ponte.SIMULAR = True
    rastreio.montar_detector = original
    ponte._instalar_opencv = instalar_original
    ponte._instalando_opencv.update({"tentou": False, "rodando": False})

    ponte._config["seguir"] = {"ativo": False}
    corpo, codigo = ponte._acao_do_painel({"tipo": "seguir_ligar"}, "local")
    conferir("seguir.ativo: false bloqueia ligar", codigo == 400, corpo)
    conferir("e o cartao nem aparece", "seguir_pessoa" not in cliente.get("/api/painel").get_json()["luz"])

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
for f in FALHAS:
    print("  - " + f)
sys.exit(1 if FALHAS else 0)
