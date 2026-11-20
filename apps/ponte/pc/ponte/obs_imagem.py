"""A imagem ao vivo do OBS, para o painel da igreja.

SOB DEMANDA E COM TETO. Capturar uma imagem custa ao OBS, e o OBS esta no
notebook que transmite o culto. Entao:

  - so captura quando alguem pede (uma tela aberta pede uma por segundo);
  - nunca mais que uma a cada `intervalo`, nao importa quantas telas pedem:
    cinco celulares abertos continuam sendo uma captura por segundo;
  - usa um cliente OBS so dela, para uma captura lenta nunca segurar um
    botao nem a leitura de estado;
  - pode ser desligada na hora, pelo menu do painel.

ESTA IMAGEM NAO VAI PARA A WEB. 20 KB por segundo de subida, durante a
transmissao, competem com o proprio envio do culto.

FLUXO EM VEZ DE PERGUNTA. A tela antiga perguntava "tem foto nova?" uma vez
por segundo: cada pergunta era uma ida e volta, e a imagem andava a 1 quadro
por segundo. Agora a tela abre UMA conexao (/api/painel/video, MJPEG) e a
ponte vai empurrando cada foto nova assim que ela sai do OBS — o <img> do
navegador mostra sozinho, sem JavaScript. Com intervalo 0.2 sao 5 quadros
por segundo. Continua uma captura so, por mais telas que estejam abertas.
"""

import base64
import threading
import time


class ImagemDoOBS:
    def __init__(self, cliente, cena_no_ar, intervalo=1.0, largura=480, qualidade=50,
                 agora=time.monotonic):
        self._cliente = cliente
        self._cena_no_ar = cena_no_ar
        try:
            self._intervalo = max(0.15, float(intervalo))
        except (TypeError, ValueError):
            self._intervalo = 1.0
        try:
            self._largura = max(160, min(1280, int(largura)))
        except (TypeError, ValueError):
            self._largura = 480
        self._qualidade = qualidade
        self._agora = agora
        self._tranca = threading.Lock()
        self._dados = None
        self._tipo = "image/jpeg"
        self._em = None
        self._tentou_em = None
        self.ativo = True
        self.capturas = 0

    def trocar_cliente(self, cliente):
        """Quando o endereco do OBS muda com a ponte no ar."""
        with self._tranca:
            self._cliente = cliente
            self._dados = None

    def pegar(self):
        """(bytes ou None, tipo, idade em segundos ou None)."""
        if not self.ativo or self._cliente is None:
            return None, self._tipo, None
        # A tranca faz chamadas simultaneas dividirem UMA captura: a segunda
        # espera a primeira acabar e ja encontra a imagem nova guardada.
        with self._tranca:
            agora = self._agora()
            if self._tentou_em is None or agora - self._tentou_em >= self._intervalo:
                self._tentou_em = agora
                try:
                    self._capturar()
                except Exception:
                    self._dados = None
            idade = None if self._em is None else self._agora() - self._em
            return self._dados, self._tipo, idade

    def _capturar(self):
        cena = self._cena_no_ar()
        if not cena:
            self._dados = None
            return
        self.capturas += 1
        foto = self._cliente.pedir("GetSourceScreenshot", {
            "sourceName": cena, "imageFormat": "jpg",
            "imageWidth": self._largura, "imageCompressionQuality": self._qualidade,
        })
        bruto = str(foto.get("imageData") or "")
        if "," not in bruto:
            self._dados = None
            return
        cabeca, corpo = bruto.split(",", 1)
        tipo = cabeca[5:].split(";")[0] if cabeca.startswith("data:") else ""
        self._tipo = tipo if tipo.startswith("image/") else "image/jpeg"
        self._dados = base64.b64decode(corpo)
        self._em = self._agora()


FRONTEIRA = "quadro"


def fluxo_mjpeg(pegar, intervalo, duracao=300.0, idade_maxima=5.0,
                agora=time.monotonic, dormir=time.sleep):
    """Gera um fluxo multipart/x-mixed-replace a partir de `pegar()`.

    `pegar` devolve (bytes, tipo, idade) — ImagemDoOBS.pegar ou a camera do
    seguir. So manda quando a foto mudou. Acaba sozinho depois de `duracao`
    segundos: a tela reabre, e uma aba esquecida nao prende uma thread para
    sempre. Quando o navegador fecha a conexao, o Flask encerra o gerador.
    """
    # A FRONTEIRA VAI DEPOIS DE CADA FOTO, e nao antes: o navegador so
    # desenha uma parte quando ve a fronteira seguinte. Com ela antes, cada
    # foto apareceria uma foto atrasada.
    fim = agora() + float(duracao)
    ultimo = None
    yield "--{}\r\n".format(FRONTEIRA).encode("ascii")
    while agora() < fim:
        dados, tipo, idade = pegar()
        if dados and dados is not ultimo and idade is not None and idade <= idade_maxima:
            ultimo = dados
            yield (("Content-Type: {}\r\nContent-Length: {}\r\n\r\n"
                    .format(tipo, len(dados))).encode("ascii") + dados
                   + "\r\n--{}\r\n".format(FRONTEIRA).encode("ascii"))
        dormir(intervalo)
