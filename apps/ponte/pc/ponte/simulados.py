"""OBS e Holyrics DE MENTIRA, para rodar e testar o painel sem equipamento.

So entram em cena com PONTE_SIMULAR=1 no ambiente. Nunca pelo config.yaml: um
culto nao pode ir ao ar contra um OBS inventado porque alguem esqueceu uma
linha ligada. Enquanto isto esta em uso, a tela mostra a faixa "SIMULACAO".

Respondem o suficiente do protocolo de cada um para o painel inteiro
aparecer: cenas, transmissao e gravacao que ligam e desligam, contadores que
andam, nivel de audio que se mexe, uma imagem gerada, e musicas com letra
inventada.
"""

import base64
import math
import struct
import threading
import time
import zlib

CENAS = ["1. Abertura", "2. Louvor", "3. Pregação", "4. Ofertório", "5. Telão cheio"]
VERSOS = [
    "ANTES DO SOL NASCER\nTUA VOZ ME CHAMOU", "NO SILÊNCIO DA CASA\nTEU CUIDADO ME ACHOU",
    "ÉS A LUZ DA MANHÃ\nQUE NÃO VAI SE APAGAR", "QUANDO A NOITE PESAR\nEU ME LEMBRO DE TI",
    "E O QUE ERA MEDO\nVIRA CANÇÃO", "MESMO SEM VER\nEU VOU CONFIAR",
    "TUA LUZ VAI À FRENTE\nE EU SIGO ATRÁS", "FIRME É A ROCHA\nQUE ME SUSTENTOU",
]
RECADOS = {0: "//Todos: uníssono", 3: "//Bateria: entra cheia", 7: "//cai a canção...",
           11: "//sobe a voz...", 15: "//Solo: masculino", 23: "//marcação mais alta da bateria"}


def _png(largura, altura, pixel):
    """Um PNG sem biblioteca nenhuma. `pixel(x, y)` devolve (r, g, b)."""
    linhas = bytearray()
    for y in range(altura):
        linhas.append(0)
        for x in range(largura):
            linhas.extend(pixel(x, y))

    def bloco(tipo, dados):
        corpo = tipo + dados
        return struct.pack(">I", len(dados)) + corpo + struct.pack(">I", zlib.crc32(corpo) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(bytes(linhas), 6))
            + bloco(b"IEND", b""))


class ObsSimulado:
    def __init__(self, agora=time.time):
        self._agora = agora
        self._tranca = threading.Lock()
        self.no_ar = CENAS[0]
        self.preview = CENAS[0]
        self.transmitindo_desde = None
        self.gravando_desde = None
        self.chave = "chave-de-mentira-de-hoje"
        self.pedidos = []

    # A mesma interface do ClienteOBS -------------------------------------

    def versao(self):
        return self.pedir("GetVersion")

    def cenas(self):
        return list(CENAS)

    def definir_visibilidade(self, cena, fonte, visivel):
        self.pedidos.append(("visibilidade", cena, fonte, bool(visivel)))

    def pedir(self, tipo, dados=None):
        dados = dados or {}
        agora = self._agora()
        with self._tranca:
            self.pedidos.append((tipo, dados))
            del self.pedidos[:-200]
            if tipo == "GetVersion":
                return {"obsVersion": "simulado", "obsWebSocketVersion": "5.0.0"}
            if tipo == "GetSceneList":
                return {"currentProgramSceneName": self.no_ar, "currentPreviewSceneName": self.preview,
                        "scenes": [{"sceneName": c, "sceneIndex": i} for i, c in enumerate(reversed(CENAS))]}
            if tipo == "SetCurrentProgramScene":
                self._cena(dados)
                self.no_ar = self.preview = dados["sceneName"]
                return {}
            if tipo == "SetCurrentPreviewScene":
                self._cena(dados)
                self.preview = dados["sceneName"]
                return {}
            if tipo == "TriggerStudioModeTransition":
                self.no_ar = self.preview
                return {}
            if tipo == "StartStream":
                self.transmitindo_desde = self.transmitindo_desde or agora
                return {}
            if tipo == "StopStream":
                self.transmitindo_desde = None
                return {}
            if tipo == "StartRecord":
                self.gravando_desde = self.gravando_desde or agora
                return {}
            if tipo == "StopRecord":
                self.gravando_desde = None
                return {}
            if tipo == "GetStreamStatus":
                if self.transmitindo_desde is None:
                    return {"outputActive": False}
                segundos = agora - self.transmitindo_desde
                quadros = int(segundos * 30)
                # Uma oscilacao de mentira a cada dois minutos, para a tela
                # ter o que mostrar em "Qualidade".
                perdidos = int(quadros * 0.001) + (int((segundos % 120) - 100) * 3 if segundos % 120 > 100 else 0)
                return {"outputActive": True, "outputReconnecting": False,
                        "outputDuration": int(segundos * 1000), "outputCongestion": 0.05,
                        "outputBytes": int(segundos * 562500), "outputSkippedFrames": max(0, perdidos),
                        "outputTotalFrames": quadros}
            if tipo == "GetRecordStatus":
                if self.gravando_desde is None:
                    return {"outputActive": False}
                return {"outputActive": True, "outputDuration": int((agora - self.gravando_desde) * 1000)}
            if tipo == "GetStreamServiceSettings":
                return {"streamServiceType": "rtmp_common",
                        "streamServiceSettings": {"server": "rtmp://a.rtmp.youtube.com/live2", "key": self.chave}}
            if tipo == "SetStreamServiceSettings":
                self.chave = (dados.get("streamServiceSettings") or {}).get("key") or self.chave
                return {}
            if tipo == "GetStats":
                return {"cpuUsage": 12.5, "availableDiskSpace": 217088.0, "activeFps": 30.0,
                        "renderSkippedFrames": 0, "renderTotalFrames": 1000,
                        "outputSkippedFrames": 0, "outputTotalFrames": 1000}
            if tipo == "GetSourceScreenshot":
                return {"imageData": "data:image/png;base64," + base64.b64encode(self._imagem(agora)).decode()}
        raise RuntimeError("o OBS simulado nao conhece {}".format(tipo))

    @staticmethod
    def _cena(dados):
        if dados.get("sceneName") not in CENAS:
            raise RuntimeError("nao existe a cena {!r}".format(dados.get("sceneName")))

    def _imagem(self, agora):
        """Um quadro que muda com a cena e com o tempo: da para ver que e ao vivo."""
        matiz = CENAS.index(self.no_ar) if self.no_ar in CENAS else 0
        base = [(40, 60, 120), (90, 60, 150), (30, 110, 100), (150, 110, 40), (120, 60, 60)][matiz % 5]
        barra = int((agora * 20) % 160)

        def pixel(x, y):
            if abs(x - barra) < 3:
                return (240, 240, 240)
            claro = 0.55 + 0.45 * (y / 90.0)
            return tuple(int(c * claro) for c in base)

        return _png(160, 90, pixel)

    def niveis(self):
        """O que o evento InputVolumeMeters traria agora."""
        t = self._agora()
        louvor = 0.25 + 0.2 * abs(math.sin(t * 2.3)) if self.no_ar == CENAS[1] else 0.01 * abs(math.sin(t))
        mic = 0.2 + 0.15 * abs(math.sin(t * 3.1)) if self.no_ar == CENAS[2] else 0.0
        return [{"inputName": "Mesa de som", "inputLevelsMul": [[louvor * 0.7, louvor, louvor]] * 2},
                {"inputName": "Microfone", "inputLevelsMul": [[mic * 0.7, mic, mic]]}]


class HolyricsSimulado:
    def __init__(self):
        self._tranca = threading.Lock()
        self.musica = None
        self.slide = 0
        self.preta = False
        self.historico = []
        self.pasta = None            # ShowImage: uma pasta de imagens no telao
        self.alerta = {"text": "PIX: igreja@exemplo.com.br", "show": False}

    @staticmethod
    def slides_de(identificador):
        slides = []
        for i in range(40):
            texto = VERSOS[(i + len(str(identificador))) % len(VERSOS)]
            if i in RECADOS:
                texto = RECADOS[i] + "\n" + texto
            slides.append({"number": i + 1, "text": texto})
        return slides

    def pedir(self, acao, payload=None):
        payload = payload or {}
        with self._tranca:
            self.historico.append((acao, payload))
            del self.historico[:-200]
            if acao == "ShowImage":
                self.pasta, self.musica, self.slide = str(payload.get("file") or ""), None, 0
                return {"status": "ok"}
            if acao == "GetAlert":
                return {"status": "ok", "data": dict(self.alerta)}
            if acao == "SetAlert":
                if "text" in payload:
                    self.alerta["text"] = str(payload["text"])
                if "show" in payload:
                    self.alerta["show"] = bool(payload["show"])
                return {"status": "ok"}
            if acao == "GetCurrentPresentation" and self.pasta is not None:
                dados = {"id": "pasta", "type": "image", "name": self.pasta,
                         "slide_number": self.slide + 1, "total_slides": 6}
                if payload.get("include_slides"):
                    dados["slides"] = []
                    for i in range(6):
                        item = {"number": i + 1, "text": "slide-{:02d}.jpg".format(i + 1), "slide_description": ""}
                        if payload.get("include_slide_preview"):
                            tom = 40 + 35 * i
                            item["preview"] = base64.b64encode(
                                _png(32, 18, lambda x, y, t=tom: (t, 60, 255 - t))).decode("ascii")
                        dados["slides"].append(item)
                return {"status": "ok", "data": dados}
            if acao == "GetCurrentPresentation":
                if self.musica is None:
                    return {"status": "ok", "data": None}
                dados = {"id": self.musica, "type": "song", "name": "Música " + self.musica,
                         "slide_number": self.slide + 1, "total_slides": 40}
                if payload.get("include_slides"):
                    dados["slides"] = [{"number": s["number"], "text": s["text"], "slide_description": ""}
                                       for s in self.slides_de(self.musica)]
                return {"status": "ok", "data": dados}
            if acao == "ActionNext":
                self.slide = min(5 if self.pasta is not None else 39, self.slide + 1)
                return {"status": "ok"}
            if acao == "ActionPrevious":
                self.slide = max(0, self.slide - 1)
                return {"status": "ok"}
            if acao == "GetF10":
                return {"status": "ok", "data": self.preta}
            if acao == "SetF10":
                self.preta = bool(payload.get("enable"))
                return {"status": "ok"}
            if acao == "GetSong":
                return {"status": "ok", "data": {"id": str(payload.get("id")), "title": "Música",
                                                 "slides": self.slides_de(payload.get("id"))}}
            if acao == "ShowLyrics":
                self.pasta = None
                self.musica = str(payload.get("id"))
                self.slide = 0
                return {"status": "ok"}
            if acao == "ActionGoToIndex":
                self.slide = int(payload.get("index") or 0)
                return {"status": "ok"}
            if acao == "CloseCurrentPresentation":
                self.musica = None
                self.pasta = None
                return {"status": "ok"}
            return {"status": "ok"}


class YouTubeSimulado:
    """Um canal de mentira, para ver o painel conferir o YouTube.

    `cenario` escolhe o que ele responde: "ok", "nao_recebe", "outra_chave",
    "nao_iniciada" ou "sem_transmissao". As acoes de verdade (iniciar a
    transmissao, trocar a chave do OBS) consertam o cenario, como consertariam
    a transmissao.
    """

    CHAVES = {"stream-hoje": "chave-de-mentira-de-hoje", "stream-velho": "chave-de-mentira-antiga"}

    def __init__(self, obs):
        self._obs = obs
        self.cenario = "ok"
        self.pedidos = []

    def autorizado(self):
        return True

    def canal(self):
        return {"nome": "Canal de mentira", "id": "canal-simulado"}

    def _no_ar(self):
        return self._obs.transmitindo_desde is not None

    def transmissao(self, estado="active"):
        self.pedidos.append(("transmissao", estado))
        if self.cenario == "sem_transmissao":
            return None
        ao_vivo = self._no_ar() and self.cenario != "nao_iniciada"
        if (estado == "active") != ao_vivo:
            return None
        return {"id": "video-simulado", "snippet": {"title": "Culto de domingo (simulado)", "description": ""},
                "status": {"privacyStatus": "unlisted", "lifeCycleStatus": "live" if ao_vivo else "ready"},
                "contentDetails": {"boundStreamId": "stream-hoje", "enableAutoStart": False}}

    def ultima_concluida(self):
        return None

    def espectadores(self, id_video):
        return 12

    def saude_do_envio(self, id_stream):
        return self.estado_dos_streams([id_stream]).get(id_stream, {}).get("saude")

    def chaves(self):
        self.pedidos.append(("chaves",))
        return [{"id": i, "nome": i, "servidor": "rtmp://a.rtmp.youtube.com/live2", "tem_chave": True, "estado": "ready"}
                for i in self.CHAVES]

    def chave_de(self, id_stream):
        self.pedidos.append(("chave_de", id_stream))
        return {"chave": self.CHAVES[id_stream], "servidor": "rtmp://a.rtmp.youtube.com/live2"}

    def estado_dos_streams(self, ids):
        self.pedidos.append(("estado_dos_streams", tuple(ids)))
        do_obs = next((i for i, chave in self.CHAVES.items() if chave == self._obs.chave), None)
        saida = {}
        for i in ids:
            chegando = self._no_ar() and i == do_obs and self.cenario != "nao_recebe"
            saida[i] = {"estado": "active" if chegando else "inactive", "saude": "good" if chegando else "noData"}
        return saida

    def iniciar(self, id_transmissao):
        self.pedidos.append(("iniciar", id_transmissao))
        self.cenario = "ok"
        return {}

    def atualizar(self, transmissao, titulo=None, descricao=None, privacidade=None):
        return transmissao

    @staticmethod
    def link(transmissao):
        return "https://www.youtube.com/watch?v=" + transmissao["id"] if transmissao else None
