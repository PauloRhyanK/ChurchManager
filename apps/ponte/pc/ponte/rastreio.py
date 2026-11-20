"""Seguir alguem com as cabecas do teto, pela camera aberta do OBS.

COMO FUNCIONA, em quatro pecas pequenas:

  1. CAPTURA. Uma foto pequena (416 px) da FONTE da camera aberta — nao da
     cena no ar, que troca de camera o tempo todo — algumas vezes por
     segundo, por um cliente OBS so desta peca. So captura enquanto alguem
     esta com a tela /seguir aberta ou enquanto a luz esta seguindo.

  2. DETECTOR. Acha as pessoas na foto. Dois, do melhor para o mais simples:
       yolox o YOLOX nano (Megvii, licenca Apache-2.0, 3,6 MB), em ONNX,
             rodado pelo proprio OpenCV (cv2.dnn). Sem PyTorch, sem placa de
             video. Vem junto com a ponte, em modelos/.
       hog   o detector de pessoas que ja vem no OpenCV. Erra mais (pessoa de
             lado, sentada, longe). So entra se o modelo sumir da pasta.

  3. ALVO. Quem opera clica na pessoa. Dali em diante ela e acompanhada de
     uma foto para a outra pela caixa que mais se sobrepoe a anterior. Sumiu
     por mais de PERDER_EM segundos? O alvo fica "perdido" e a LUZ FICA ONDE
     ESTA — nao apaga, nao volta ao centro, nao procura outra pessoa.

  4. CALIBRACAO. Para cada cabeca: alguem fica em pe numa marca do palco,
     quem opera mira a luz no peito dela e clica nela na imagem. Grava-se o
     par (pes na imagem) -> (pan, tilt). Com 4 pontos ou mais, uma
     homografia leva qualquer ponto do chao da imagem ao pan/tilt que acerta
     o peito de quem esta ali. Com 3, uma conta afim (menos precisa).
     A camera mudou de lugar ou de zoom? Calibra de novo.

O QUE SAI DAQUI e so o alvo de cada cabeca, {endereco: [pan, tilt]}, para o
motor de movimento (ponte/movimento.py, "SEGUIR"). E la, com os limites da
maquina que alcanca a luz, que se decide quao rapido e ate onde a cabeca
anda. Nada aqui escreve canal de luz.

O OpenCV e opcional: sem ele a ponte inteira funciona igual, e a tela
/seguir so diz como instalar (requirements-seguir.txt).
"""

import json
import math
import os
import threading
import time


class ErroRastreio(Exception):
    pass


class FaltaOpenCV(ErroRastreio):
    """O OpenCV nao esta instalado. A ponte instala sozinha (ver app.py)."""


# Os tipos de entrada do OBS que sao CAMERA de verdade: placa de captura,
# webcam, NDI. Fica de fora arquivo de video, imagem, navegador, texto.
TIPOS_DE_CAMERA = ("dshow_input", "av_capture_input", "av_capture_input_v2", "macos-avcapture",
                   "v4l2_input", "decklink-input", "ndi_source", "aja_source")


def cameras_do_obs(cliente):
    """[nome, ...] das entradas de camera do OBS, na ordem dele."""
    resposta = cliente.pedir("GetInputList", {})
    return [str(e.get("inputName")) for e in (resposta.get("inputs") or [])
            if str(e.get("inputKind") or "") in TIPOS_DE_CAMERA and e.get("inputName")]


def _cv():
    try:
        import cv2          # noqa: F401
        import numpy        # noqa: F401
    except Exception as erro:
        raise FaltaOpenCV("falta o OpenCV neste PC: {}".format(erro))
    import cv2
    import numpy
    global _UMA_THREAD
    if not _UMA_THREAD:
        # UMA THREAD SO, de proposito. Duas razoes: o PC principal tem mais o
        # que fazer (Holyrics, painel, OBS) e o seguir nao pode tomar a CPU
        # dele; e o HOG em paralelo derrubou o processo inteiro (Bus error)
        # num teste em 19/11. O YOLOX nano cabe folgado numa thread.
        cv2.setNumThreads(1)
        _UMA_THREAD = True
    return cv2, numpy


_UMA_THREAD = False


# -- conta: homografia sem numpy ----------------------------------------------

def _resolver(a, b):
    """Resolve a.x = b por eliminacao de Gauss com pivo. a e n x n."""
    n = len(b)
    m = [list(map(float, linha)) + [float(v)] for linha, v in zip(a, b)]
    for col in range(n):
        piv = max(range(col, n), key=lambda i: abs(m[i][col]))
        if abs(m[piv][col]) < 1e-12:
            raise ErroRastreio("pontos de calibracao alinhados demais; espalhe as marcas")
        m[col], m[piv] = m[piv], m[col]
        for i in range(n):
            if i != col:
                f = m[i][col] / m[col][col]
                for j in range(col, n + 1):
                    m[i][j] -= f * m[col][j]
    return [m[i][n] / m[i][i] for i in range(n)]


def _minimos_quadrados(linhas, valores):
    """Melhor x para linhas.x ~ valores (equacoes normais)."""
    n = len(linhas[0])
    ata = [[sum(l[i] * l[j] for l in linhas) for j in range(n)] for i in range(n)]
    atb = [sum(l[i] * v for l, v in zip(linhas, valores)) for i in range(n)]
    return _resolver(ata, atb)


class Mapa:
    """Leva um ponto da imagem (0-1) ao (pan, tilt) de uma cabeca."""

    def __init__(self, pontos):
        pares = [(float(p["x"]), float(p["y"]), float(p["pan"]), float(p["tilt"]))
                 for p in pontos]
        if len(pares) < 3:
            raise ErroRastreio("precisa de pelo menos 3 pontos (melhor 4 a 6)")
        # Escala a saida para 0-1: deixa as equacoes bem comportadas.
        linhas, valores = [], []
        if len(pares) >= 4:
            for x, y, pan, tilt in pares:
                u, v = pan / 255.0, tilt / 255.0
                linhas.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); valores.append(u)
                linhas.append([0, 0, 0, x, y, 1, -v * x, -v * y]); valores.append(v)
            h = _minimos_quadrados(linhas, valores)
            self._h = h + [1.0]
            self.tipo = "homografia"
        else:
            for x, y, pan, tilt in pares:
                linhas.append([x, y, 1, 0, 0, 0]); valores.append(pan / 255.0)
                linhas.append([0, 0, 0, x, y, 1]); valores.append(tilt / 255.0)
            a = _minimos_quadrados(linhas, valores)
            self._h = a + [0.0, 0.0, 1.0]
            self.tipo = "afim"
        # A cerca da calibracao: o mapa so vale perto de onde foi medido. Fora
        # disso a conta extrapola e a luz poderia ir para o forro ou para a
        # plateia; entao a saida fica presa ao que foi calibrado, com folga.
        folga = 12
        pans = [p[2] for p in pares]
        tilts = [p[3] for p in pares]
        self.cerca = (max(0, min(pans) - folga), min(255, max(pans) + folga),
                      max(0, min(tilts) - folga), min(255, max(tilts) + folga))
        self.erro = max(math.hypot(self._cru(x, y)[0] - pan, self._cru(x, y)[1] - tilt)
                        for x, y, pan, tilt in pares)

    def _cru(self, x, y):
        h = self._h
        w = h[6] * x + h[7] * y + h[8]
        if abs(w) < 1e-9:
            raise ErroRastreio("ponto fora do alcance da calibracao")
        return ((h[0] * x + h[1] * y + h[2]) / w * 255.0,
                (h[3] * x + h[4] * y + h[5]) / w * 255.0)

    def aplicar(self, x, y):
        pan, tilt = self._cru(x, y)
        pmin, pmax, tmin, tmax = self.cerca
        return (max(pmin, min(pmax, pan)), max(tmin, min(tmax, tilt)))


# -- detectores ---------------------------------------------------------------

class DetectorYolox:
    """YOLOX nano em ONNX (Megvii, Apache-2.0), so a classe pessoa.

    Entrada fixa de 416 x 416, BGR, sem normalizar, com o resto preenchido de
    cinza 114. A saida e CRUA (1 x 3549 x 85): cada linha e uma celula das
    grades de passo 8, 16 e 32, e a caixa precisa ser decodificada pela grade.
    E o mesmo pos-processamento do exemplo oficial do YOLOX.
    """

    nome = "yolox"
    LADO = 416
    PASSOS = (8, 16, 32)

    def __init__(self, caminho, confianca=0.4):
        cv2, np = _cv()
        if not os.path.isfile(caminho):
            raise ErroRastreio("nao achei o modelo {}".format(caminho))
        self._rede = cv2.dnn.readNetFromONNX(caminho)
        self._confianca = float(confianca)
        self._montar_grade()

    def _montar_grade(self):
        _, np = _cv()
        grades, passos = [], []
        for passo in self.PASSOS:
            n = self.LADO // passo
            xs, ys = np.meshgrid(np.arange(n), np.arange(n))
            grades.append(np.stack((xs, ys), 2).reshape(-1, 2))
            passos.append(np.full((n * n, 1), passo))
        self._grade = np.concatenate(grades).astype(np.float32)
        self._passo = np.concatenate(passos).astype(np.float32)

    def detectar(self, imagem):
        cv2, np = _cv()
        alto, largo = imagem.shape[:2]
        lado = self.LADO
        escala = min(lado / alto, lado / largo)
        novo = cv2.resize(imagem, (int(largo * escala), int(alto * escala)))
        quadro = np.full((lado, lado, 3), 114, dtype=np.uint8)
        quadro[:novo.shape[0], :novo.shape[1]] = novo
        blob = quadro.transpose(2, 0, 1)[None].astype(np.float32)
        self._rede.setInput(blob)
        saida = np.squeeze(self._rede.forward())
        if saida.ndim != 2 or saida.shape[0] != len(self._grade) or saida.shape[1] < 6:
            return []
        centros = (saida[:, :2] + self._grade) * self._passo
        tamanhos = np.exp(saida[:, 2:4]) * self._passo
        notas = saida[:, 4] * saida[:, 5]           # objeto x classe pessoa
        boas = notas >= self._confianca
        if not boas.any():
            return []
        caixas = [[float(cx - w / 2), float(cy - h / 2), float(w), float(h)]
                  for (cx, cy), (w, h) in zip(centros[boas], tamanhos[boas])]
        valores = [float(n) for n in notas[boas]]
        manter = cv2.dnn.NMSBoxes(caixas, valores, self._confianca, 0.45)
        resultado = []
        for i in np.array(manter).flatten():
            x, y, w, h = caixas[int(i)]
            resultado.append(_normalizar(x / escala, y / escala, w / escala, h / escala,
                                         largo, alto, valores[int(i)]))
        return resultado


class DetectorHog:
    """O detector de pessoas que ja vem no OpenCV. Sem modelo para baixar."""

    nome = "hog"

    def __init__(self, confianca=0.3):
        cv2, _ = _cv()
        if not hasattr(cv2, "HOGDescriptor"):
            raise ErroRastreio("este OpenCV nao tem o detector simples; use o 4.x de "
                               "requirements-seguir.txt ou ponha o modelo YOLO em modelos/")
        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self._confianca = float(confianca)

    def detectar(self, imagem):
        cv2, np = _cv()
        alto, largo = imagem.shape[:2]
        # O HOG so enxerga pessoa com 128 px de altura ou mais, e com imagem
        # menor que a janela dele (64 x 128) o OpenCV DERRUBA o processo em
        # vez de devolver vazio (achado em 19/11). Numa foto de 416 do palco
        # inteiro, gente tem 60-100 px: entao amplia antes, ate 400 de altura.
        fator = max(1.0, min(2.5, 400.0 / max(1, alto)))
        if fator > 1.0:
            imagem = cv2.resize(imagem, (int(largo * fator), int(alto * fator)))
        if imagem.shape[0] < 136 or imagem.shape[1] < 72:
            return []
        caixas, notas = self._hog.detectMultiScale(imagem, winStride=(8, 8),
                                                   padding=(8, 8), scale=1.05)
        if len(caixas) == 0:
            return []
        largo, alto = imagem.shape[1], imagem.shape[0]
        notas = [float(n) for n in np.array(notas).flatten()]
        lista = [list(map(float, c)) for c in caixas]
        manter = cv2.dnn.NMSBoxes(lista, notas, self._confianca, 0.45)
        return [_normalizar(*lista[int(i)], largo, alto, notas[int(i)])
                for i in np.array(manter).flatten()]


def _normalizar(x, y, w, h, largo, alto, nota):
    x1 = max(0.0, min(1.0, x / largo))
    y1 = max(0.0, min(1.0, y / alto))
    x2 = max(0.0, min(1.0, (x + w) / largo))
    y2 = max(0.0, min(1.0, (y + h) / alto))
    return {"caixa": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)],
            "nota": round(float(nota), 2)}


def montar_detector(conf, raiz):
    """yolo se o modelo existe, senao hog. Levanta ErroRastreio sem OpenCV."""
    _cv()
    modelo = str(conf.get("modelo") or "modelos/yolox_nano.onnx")
    caminho = modelo if os.path.isabs(modelo) else os.path.join(raiz, modelo)
    if os.path.isfile(caminho):
        return DetectorYolox(caminho, conf.get("confianca", 0.4))
    return DetectorHog()


# -- alvo ---------------------------------------------------------------------

def _sobreposicao(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    uniao = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / uniao if uniao > 0 else 0.0


def _centro(c):
    return ((c[0] + c[2]) / 2.0, (c[1] + c[3]) / 2.0)


class Alvo:
    """Quem esta sendo seguido. Acompanhado pela sobreposicao das caixas."""

    PERDER_EM = 1.5     # segundos sem ver a pessoa ate dizer "perdido"
    AMACIAR = 0.5       # quanto do ponto novo entra a cada foto (0-1)

    def __init__(self, agora=time.monotonic):
        self._agora = agora
        self.caixa = None
        self.pes = None
        self.visto_em = None

    def escolher(self, pessoas, x, y):
        """A pessoa clicada: a caixa que contem o ponto, ou a mais perto."""
        if not pessoas:
            return False
        dentro = [p for p in pessoas
                  if p["caixa"][0] <= x <= p["caixa"][2] and p["caixa"][1] <= y <= p["caixa"][3]]
        candidatas = dentro or pessoas
        escolhida = min(candidatas, key=lambda p: math.hypot(_centro(p["caixa"])[0] - x,
                                                             _centro(p["caixa"])[1] - y))
        if not dentro and math.hypot(_centro(escolhida["caixa"])[0] - x,
                                     _centro(escolhida["caixa"])[1] - y) > 0.15:
            return False
        self.caixa = list(escolhida["caixa"])
        self.pes = self._pes_de(self.caixa)
        self.visto_em = self._agora()
        return True

    def soltar(self):
        self.caixa = self.pes = self.visto_em = None

    @staticmethod
    def _pes_de(c):
        return ((c[0] + c[2]) / 2.0, c[3])

    def atualizar(self, pessoas):
        if self.caixa is None:
            return
        melhor, nota = None, 0.0
        for p in pessoas:
            s = _sobreposicao(self.caixa, p["caixa"])
            if s > nota:
                melhor, nota = p, s
        if melhor is None or nota < 0.2:
            # Sem sobreposicao: aceita a caixa mais perto, se andou pouco
            # (alguem andando rapido numa foto lenta).
            perto = [p for p in pessoas
                     if math.hypot(_centro(p["caixa"])[0] - _centro(self.caixa)[0],
                                   _centro(p["caixa"])[1] - _centro(self.caixa)[1]) < 0.08]
            if not perto:
                return
            melhor = perto[0]
        self.caixa = list(melhor["caixa"])
        novo = self._pes_de(self.caixa)
        a = self.AMACIAR
        self.pes = (self.pes[0] + (novo[0] - self.pes[0]) * a,
                    self.pes[1] + (novo[1] - self.pes[1]) * a)
        self.visto_em = self._agora()

    def situacao(self):
        if self.caixa is None:
            return "ninguem"
        if self._agora() - self.visto_em > self.PERDER_EM:
            return "perdido"
        return "seguindo"


# -- calibracao ---------------------------------------------------------------

class Calibracao:
    """Os pontos de cada cabeca, guardados em arquivo. {endereco: [pontos]}."""

    def __init__(self, caminho):
        self._caminho = caminho
        self._tranca = threading.Lock()
        self._pontos = {}
        self._fonte = None
        try:
            with open(caminho, encoding="utf-8") as arquivo:
                tudo = json.load(arquivo)
            self._pontos = {int(k): list(v) for k, v in (tudo.get("luzes") or {}).items()}
            self._fonte = tudo.get("fonte") or None
        except (OSError, ValueError, AttributeError):
            self._pontos = {}

    def _gravar(self):
        temporario = self._caminho + ".tmp"
        with open(temporario, "w", encoding="utf-8") as arquivo:
            json.dump({"fonte": self._fonte, "luzes": {str(k): v for k, v in self._pontos.items()}},
                      arquivo, ensure_ascii=False, indent=1)
        os.replace(temporario, self._caminho)

    def acrescentar(self, base, x, y, pan, tilt):
        ponto = {"x": round(float(x), 4), "y": round(float(y), 4),
                 "pan": int(pan), "tilt": int(tilt)}
        if not (0 <= ponto["x"] <= 1 and 0 <= ponto["y"] <= 1
                and 0 <= ponto["pan"] <= 255 and 0 <= ponto["tilt"] <= 255):
            raise ErroRastreio("ponto fora da faixa")
        with self._tranca:
            self._pontos.setdefault(int(base), []).append(ponto)
            self._gravar()

    def limpar(self, base):
        with self._tranca:
            self._pontos.pop(int(base), None)
            self._gravar()

    def fonte(self):
        with self._tranca:
            return self._fonte

    def trocar_fonte(self, nome):
        """A camera escolhida. Trocar de camera APAGA a calibracao: os pontos
        foram medidos na imagem da outra, e nao valem para esta."""
        nome = str(nome or "") or None
        with self._tranca:
            if nome == self._fonte:
                return False
            self._fonte = nome
            self._pontos = {}
            self._gravar()
        return True

    def pontos(self, base):
        with self._tranca:
            return list(self._pontos.get(int(base), []))

    def mapas(self):
        """{endereco: Mapa} das cabecas com calibracao que serve."""
        with self._tranca:
            copia = {b: list(p) for b, p in self._pontos.items()}
        mapas = {}
        for base, pontos in copia.items():
            try:
                mapas[base] = Mapa(pontos)
            except ErroRastreio:
                continue
        return mapas


# -- o laco -------------------------------------------------------------------

class Rastreador:
    """Captura, detecta, acompanha o alvo e, se ligado, manda o motor seguir.

    Uma thread so, que dorme quando ninguem esta olhando e a luz nao esta
    seguindo: abrir a tela custa algo ao OBS, esquecer a tela aberta nao.
    """

    OLHANDO_POR = 8.0       # segundos que um pedido da tela mantem a captura

    def __init__(self, cliente, fonte, detector, motor, calibracao, bases,
                 fps=6, largura=416, agora=time.monotonic, aviso=print):
        self._cliente = cliente
        # A camera: a do config, se alguem escreveu; senao a escolhida na tela
        # (guardada com a calibracao); senao, se o OBS tem UMA camera so, ela.
        self._fonte_do_config = str(fonte or "")
        self.detector = detector
        self._motor = motor
        self.calibracao = calibracao
        self.bases = [int(b) for b in bases]
        self._intervalo = 1.0 / max(1.0, min(15.0, float(fps or 8)))
        self._largura = max(160, min(960, int(largura or 416)))
        self._agora = agora
        self._aviso = aviso
        self.alvo = Alvo(agora)
        self._tranca = threading.Lock()
        self._mapas = calibracao.mapas()
        self.seguindo = False
        self._olhado_em = None
        self._jpeg = None
        self._jpeg_em = None
        self._pessoas = []
        self._erro = None
        self._fps = 0.0
        self._parar = threading.Event()
        self._acordar = threading.Event()
        self._thread = None

    # -- controle -------------------------------------------------------------

    def comecar(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._laco, daemon=True)
            self._thread.start()

    def parar(self):
        self._parar.set()
        self._acordar.set()
        if self._thread:
            self._thread.join(timeout=3.0)

    def trocar_cliente(self, cliente):
        with self._tranca:
            self._cliente = cliente

    def olhar(self):
        """A tela esta aberta: mantem a captura viva por mais um pouco."""
        self._olhado_em = self._agora()
        self._acordar.set()

    def escolher(self, x, y):
        with self._tranca:
            return self.alvo.escolher(self._pessoas, float(x), float(y))

    def soltar(self):
        with self._tranca:
            self.alvo.soltar()

    def ligar(self, ligar):
        """Liga ou desliga a luz seguindo. Desligar devolve as cabecas a cena."""
        if not ligar:
            self.seguindo = False
            if self._motor is not None:
                self._motor.parar_seguir()
            return True
        # Ligar sem calibracao e permitido: a luz so anda com luz calibrada E
        # pessoa escolhida (ver passo). Enquanto falta, o painel diz o que e.
        self.seguindo = True
        self._acordar.set()
        return True

    def recalibrou(self):
        self._mapas = self.calibracao.mapas()
        if not self._mapas and self._motor is not None:
            self._motor.parar_seguir()

    def mapas(self):
        return dict(self._mapas)

    @property
    def fonte(self):
        return self._fonte_do_config or self.calibracao.fonte() or ""

    def cameras(self):
        """As cameras que o OBS tem agora. [] se o OBS nao responde."""
        with self._tranca:
            cliente = self._cliente
        try:
            return cameras_do_obs(cliente)
        except Exception:
            return []

    def escolher_camera(self, nome):
        """Troca a camera. Apaga a calibracao e desliga o seguir."""
        if self._fonte_do_config:
            raise ErroRastreio("a camera esta fixa no config.yaml (seguir.fonte)")
        if nome not in self.cameras():
            raise ErroRastreio("o OBS nao tem a camera {!r}".format(nome))
        if self.calibracao.trocar_fonte(nome):
            # Sem calibracao a luz para sozinha (recalibrou); o Seguir continua
            # ligado, e o painel passa a dizer "falta calibrar".
            self.soltar()
            self.recalibrou()
        return True

    def _achar_fonte(self):
        if self.fonte:
            return self.fonte
        cameras = self.cameras()
        if len(cameras) == 1:
            self.calibracao.trocar_fonte(cameras[0])
            return cameras[0]
        if not cameras:
            raise ErroRastreio("o OBS nao tem nenhuma camera (ou nao respondeu)")
        raise ErroRastreio("o OBS tem {} cameras: escolha qual olha o palco".format(len(cameras)))

    # -- leitura --------------------------------------------------------------

    def imagem(self):
        """(jpeg, tipo, idade) — o mesmo formato de ImagemDoOBS.pegar()."""
        self.olhar()
        with self._tranca:
            idade = None if self._jpeg_em is None else self._agora() - self._jpeg_em
            return self._jpeg, "image/jpeg", idade

    def situacao(self):
        """O que o painel do culto mostra, numa palavra."""
        if not self.seguindo:
            return "desligado"
        if self._erro:
            return "erro"
        if not self._mapas:
            return "falta_calibrar"
        return self.alvo.situacao()      # ninguem, seguindo ou perdido

    def retrato(self):
        with self._tranca:
            pessoas = [dict(p) for p in self._pessoas]
            situacao = self.alvo.situacao()
            caixa = list(self.alvo.caixa) if self.alvo.caixa else None
        return {
            "fonte": self.fonte,
            "fonte_fixa": bool(self._fonte_do_config),
            "detector": getattr(self.detector, "nome", "?"),
            "seguindo": self.seguindo,
            "alvo": {"situacao": situacao, "caixa": caixa},
            "pessoas": pessoas,
            "fps": round(self._fps, 1),
            "erro": self._erro,
            "alvos": (self._motor.seguir() or {}).get("alvos") if self._motor else None,
        }

    # -- laco -----------------------------------------------------------------

    def _precisa(self):
        if self.seguindo:
            return True
        return self._olhado_em is not None and self._agora() - self._olhado_em < self.OLHANDO_POR

    def _laco(self):
        ultimo = None
        while not self._parar.is_set():
            if not self._precisa():
                self._fps = 0.0
                self._acordar.wait(1.0)
                self._acordar.clear()
                continue
            comeco = self._agora()
            try:
                self.passo()
                self._erro = None
            except Exception as erro:
                if self._erro != str(erro):
                    self._aviso("[seguir] {}".format(erro))
                self._erro = str(erro)
                self._parar.wait(1.0)
            fim = self._agora()
            if ultimo is not None and fim > ultimo:
                self._fps = self._fps * 0.8 + 0.2 * (1.0 / (fim - ultimo))
            ultimo = fim
            self._parar.wait(max(0.0, self._intervalo - (fim - comeco)))

    def passo(self):
        """Uma volta: foto, pessoas, alvo, luz. Separado para os testes."""
        cv2, np = _cv()
        with self._tranca:
            cliente = self._cliente
        fonte = self._achar_fonte()
        foto = cliente.pedir("GetSourceScreenshot", {
            "sourceName": fonte, "imageFormat": "jpg",
            "imageWidth": self._largura, "imageCompressionQuality": 60,
        })
        bruto = str(foto.get("imageData") or "")
        if "," not in bruto:
            raise ErroRastreio("o OBS nao devolveu imagem da camera {!r}".format(fonte))
        import base64
        dados = np.frombuffer(base64.b64decode(bruto.split(",", 1)[1]), dtype=np.uint8)
        imagem = cv2.imdecode(dados, cv2.IMREAD_COLOR)
        if imagem is None:
            raise ErroRastreio("imagem da camera ilegivel")

        pessoas = self.detector.detectar(imagem)
        with self._tranca:
            self._pessoas = pessoas
            # Seguindo e ninguem escolhido: se ha UMA pessoa so na imagem, e
            # ela. Com duas ou mais, quem opera escolhe na tela /seguir.
            if self.seguindo and self.alvo.caixa is None and len(pessoas) == 1:
                c = pessoas[0]["caixa"]
                self.alvo.escolher(pessoas, (c[0] + c[2]) / 2.0, (c[1] + c[3]) / 2.0)
            self.alvo.atualizar(pessoas)
            situacao = self.alvo.situacao()
            pes = self.alvo.pes

        if self.seguindo and self._motor is not None and situacao == "seguindo" and pes:
            alvos = {}
            for base, mapa in self._mapas.items():
                if base in self.bases:
                    try:
                        alvos[str(base)] = list(mapa.aplicar(*pes))
                    except ErroRastreio:
                        continue
            if alvos:
                self._motor.definir_seguir({"alvos": alvos})
        # Perdido ou ninguem: NADA muda no motor. A luz fica onde esta.

        jpeg = self._desenhar(cv2, imagem, pessoas)
        with self._tranca:
            self._jpeg = jpeg
            self._jpeg_em = self._agora()

    def _desenhar(self, cv2, imagem, pessoas):
        alto, largo = imagem.shape[:2]
        with self._tranca:
            caixa_alvo = self.alvo.caixa
            situacao = self.alvo.situacao()
        for p in pessoas:
            x1, y1, x2, y2 = p["caixa"]
            cv2.rectangle(imagem, (int(x1 * largo), int(y1 * alto)),
                          (int(x2 * largo), int(y2 * alto)), (200, 200, 200), 1)
        if caixa_alvo:
            cor = (80, 220, 80) if situacao == "seguindo" else (40, 160, 245)
            x1, y1, x2, y2 = caixa_alvo
            cv2.rectangle(imagem, (int(x1 * largo), int(y1 * alto)),
                          (int(x2 * largo), int(y2 * alto)), cor, 3)
            cv2.circle(imagem, (int((x1 + x2) / 2 * largo), int(y2 * alto)), 5, cor, -1)
        for base in self.bases:
            for p in self.calibracao.pontos(base):
                cv2.drawMarker(imagem, (int(p["x"] * largo), int(p["y"] * alto)),
                               (245, 160, 60), cv2.MARKER_CROSS, 10, 2)
        ok, saida = cv2.imencode(".jpg", imagem, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        return saida.tobytes() if ok else None
