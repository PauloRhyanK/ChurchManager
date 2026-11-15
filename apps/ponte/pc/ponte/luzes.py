"""Saida de luz — o conector trocavel.

O MOTOR DE CUES NAO SABE QUE HARDWARE EXISTE. Ele conhece duas funcoes, e
nada mais:

    aplicar(canais)   canais e {numero_do_canal: valor}, 1-512 e 0-255
    descrever()       texto curto para a pilula de status do painel

Qualquer driver que cumpra esse contrato serve. Trocar de equipamento muda
duas linhas do config.yaml, nunca uma linha de cue.

DRIVERS E O QUE CADA UM COBRE
-----------------------------
  artnet    Qualquer no Art-Net na rede: interface Lumikit, mesa que receba
            Art-Net, ou o QLC+ escutando em 127.0.0.1. Este ultimo caso e o
            que faz uma interface USB-DMX funcionar SEM driver novo — o QLC+
            recebe Art-Net e entrega no USB.

  nenhum    Nada ligado. Passos de luz viram "pulado" no painel, e o resto
            da cue roda normal.

  usb_dmx   (ainda nao existe) USB-DMX direto, sem QLC+ no meio. So vale a
            pena se quiserem tirar o QLC+ do caminho; e um arquivo novo
            atras deste mesmo contrato.

SOBRE ART-NET
-------------
E UDP puro: a gente envia e nao ha confirmacao de volta. "Enviado com
sucesso" aqui significa que o pacote saiu da placa de rede, nao que a luz
mudou. Para conferir de verdade, so olhando a luz — ou o LED da interface,
que costuma ficar aceso fixo com sinal valido e piscando sem sinal.

E POR ISSO O QUADRO E REENVIADO SEMPRE, nao so quando muda: sem confirmacao,
um pacote perdido deixaria a luz errada ate a proxima cue. Ver _bater().
"""

import socket
import threading
import time

PORTA_ARTNET = 6454
CANAIS_POR_UNIVERSO = 512

# Quando ha movimento, o quadro muda a cada envio e precisa de taxa de mesa.
# 30 por segundo e o suficiente para o olho ler como contínuo; acima disso so
# gasta rede. Sem movimento, 1 por segundo basta para manter o enlace vivo.
INTERVALO_COM_MOVIMENTO = 1.0 / 30.0


class ErroLuzes(Exception):
    """Canal/valor invalido ou falha ao enviar o pacote."""


def validar(canais):
    """Devolve {canal: valor} limpo, ou levanta. NAO toca em nada.

    Separado de quem aplica de proposito: os dois drivers precisam da mesma
    validacao, e duplicar isso seria a receita para um deles aceitar o que o
    outro recusa.
    """
    validados = {}
    for canal, valor in (canais or {}).items():
        try:
            numero = int(canal)
            nivel = int(valor)
        except (TypeError, ValueError):
            raise ErroLuzes(
                "canal ou valor nao numerico: {!r}: {!r}".format(canal, valor)
            )
        if not 1 <= numero <= CANAIS_POR_UNIVERSO:
            raise ErroLuzes("canal {} fora da faixa 1-512".format(numero))
        if not 0 <= nivel <= 255:
            raise ErroLuzes(
                "valor {} do canal {} fora da faixa 0-255".format(nivel, numero)
            )
        validados[numero] = nivel
    return validados


class ClienteArtNet:
    """Driver Art-Net. Cumpre o contrato: aplicar() e descrever()."""

    def __init__(self, host, universo=0, timeout=2.0, reenvio_segundos=1.0,
                 modulador=None):
        self._host = host
        self._universo = int(universo)
        # Quem sabe fazer a luz andar. Opcional: sem ele o cliente e o mesmo
        # de antes. Ver ponte/movimento.py.
        self._modulador = modulador
        self._nascimento = time.monotonic()
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self._sock.settimeout(timeout)
        # Estado atual do universo. Art-Net manda os 512 canais sempre, entao a
        # ponte guarda o quadro inteiro e so sobrescreve os canais da look.
        self._quadro = bytearray(CANAIS_POR_UNIVERSO)
        self._sequencia = 0
        self._lock = threading.Lock()

        self._reenvio = float(reenvio_segundos or 0)
        self._parar = threading.Event()
        self._batida = None
        if self._reenvio > 0:
            self._batida = threading.Thread(target=self._bater, daemon=True)
            self._batida.start()

    def _bater(self):
        """Reenvia o quadro atual para sempre, mesmo sem ninguem mudar nada.

        ACHADO CONTRA O HARDWARE REAL em 08/11, e nao e perfeccionismo de
        protocolo. A versao anterior mandava UM pacote por aplicar() e calava.
        Art-Net e UDP sem confirmacao: um unico pacote perdido deixava a luz
        errada ATE A PROXIMA CUE — que num culto pode ser quinze minutos
        depois. E se a interface reiniciasse, voltava sem quadro nenhum.

        A propria Lumikit denuncia isso: o LED de Art-Net fica verde fixo
        enquanto chega sinal e PISCA EM ERRO quando para. Com um pacote so,
        ela passava a vida piscando erro.

        A especificacao pede reenvio continuo. Uma vez por segundo basta para
        manter o enlace vivo e devolver a luz certa depois de qualquer perda;
        quem quiser o comportamento de mesa (30 Hz) e so baixar o intervalo no
        config. Um pacote de 530 bytes por segundo nao pesa em rede nenhuma.
        """
        # ESPERA PRIMEIRO, ENVIA DEPOIS — e a ordem importa. Com "envia antes
        # de esperar", a thread manda um quadro VAZIO no instante em que
        # nasce, antes de qualquer aplicar(): em producao isso e um PACOTE DE
        # APAGAO no momento em que a ponte sobe. Achado contra o hardware.
        #
        # O intervalo e recalculado a cada volta, nao fixado no inicio: ligar
        # ou desligar um modo muda o ritmo na hora, sem reiniciar nada.
        while not self._parar.wait(self._intervalo()):
            with self._lock:
                try:
                    self._enviar()
                except ErroLuzes:
                    # Rede caiu ou cabo saiu: o proximo aplicar() vai reclamar
                    # com quem clicou. Esta thread nao tem a quem avisar, e
                    # morrer calada aqui deixaria a luz sem reenvio para
                    # sempre — entao ela insiste.
                    pass

    def _intervalo(self):
        if self._modulador is not None and self._modulador.ativo():
            return INTERVALO_COM_MOVIMENTO
        return self._reenvio

    def reenviar(self):
        """Manda o quadro AGORA, sem esperar o proximo batimento.

        Existe para o botao "Parado" responder na hora: desligar o movimento
        so teria efeito no proximo envio, que pode demorar um segundo — tempo
        demais para um botao que serve para abortar.
        """
        with self._lock:
            self._enviar()

    def parar(self):
        """Encerra o reenvio. So serve para teste; no culto ela roda sempre."""
        self._parar.set()
        if self._batida:
            self._batida.join(timeout=2.0)

    def aplicar(self, canais):
        """Aplica uma look. `canais` e {numero_do_canal: valor}, 1-512 e 0-255.

        VALIDA TUDO ANTES DE TOCAR NO QUADRO, de proposito. A versao anterior
        gravava canal por canal dentro do laco de validacao: com uma look
        {1: 100, 999: 50}, o canal 1 ja tinha sido gravado quando o 999
        estourava, o envio era abortado, e aquele valor orfao saia no proximo
        disparo de QUALQUER outra look. Luz inexplicavel com dias de distancia
        da causa. Ou a look inteira entra, ou nada entra.
        """
        validados = validar(canais)

        with self._lock:
            for numero, nivel in validados.items():
                self._quadro[numero - 1] = nivel
            self._enviar()

    def _enviar(self):
        # Sequencia 1-255 (0 significa "sem ordenacao" no protocolo).
        self._sequencia = self._sequencia % 255 + 1

        # O MOVIMENTO E CALCULADO AQUI, NUMA COPIA, e nunca gravado no quadro
        # base. E o que faz "parado" devolver exatamente a cena: a modulacao
        # some, nao e desfeita. Se ela fosse escrita em self._quadro, cada
        # volta modularia o resultado da anterior e a luz derivaria sozinha.
        saida = self._quadro
        if self._modulador is not None and self._modulador.ativo():
            saida = self._modulador.aplicar(
                bytearray(self._quadro), time.monotonic() - self._nascimento
            )

        pacote = bytearray(b"Art-Net\x00")
        pacote += (0x5000).to_bytes(2, "little")        # OpDmx
        pacote += (14).to_bytes(2, "big")               # versao do protocolo
        pacote += bytes([self._sequencia, 0])           # sequencia, physical
        pacote += self._universo.to_bytes(2, "little")
        pacote += CANAIS_POR_UNIVERSO.to_bytes(2, "big")
        pacote += saida

        try:
            self._sock.sendto(bytes(pacote), (self._host, PORTA_ARTNET))
        except OSError as erro:
            raise ErroLuzes(
                "nao consegui enviar Art-Net para {} ({})".format(self._host, erro)
            )

    def descrever(self):
        return "Art-Net para {} (universo {})".format(self._host, self._universo)


class ClienteAgente:
    """Driver que NAO MANDA NADA: so guarda o que deveria estar no ar.

    Existe por causa da rede da igreja. A interface de luz esta atras de um
    roteador que faz NAT: o PC do som a alcanca, esta maquina nao. E o NAT so
    deixa passar conexao de SAIDA, entao nao adianta esta maquina tentar
    empurrar comando para la.

    A solucao inverte o sentido: o PC do som PERGUNTA. Esta maquina guarda o
    quadro desejado; ele busca, e aplica na luz do lado dele. Tudo de saida,
    que e o que o NAT permite — e nenhuma mudanca de rede e necessaria.

    O MOVIMENTO NAO VAI NO FIO. Vai o quadro parado mais o NOME do modo; quem
    calcula o movimento e o outro lado, a 30 quadros por segundo, localmente.
    Mandar 30 quadros por segundo pela rede seria desperdicio, e ainda ficaria
    tremido. Assim o trafego e so quando algo muda, e o movimento e suave.

    Cumpre o mesmo contrato dos outros drivers — aplicar() e descrever() — e e
    por isso que nada no motor de cues precisou mudar para isto existir.
    """

    def __init__(self, descricao="outra maquina"):
        self._quadro = bytearray(CANAIS_POR_UNIVERSO)
        self._versao = 0
        self._lock = threading.Lock()
        self._descricao = str(descricao)

    def aplicar(self, canais):
        validados = validar(canais)
        with self._lock:
            for numero, nivel in validados.items():
                self._quadro[numero - 1] = nivel
            # A versao e o que deixa o outro lado baratinho: ele guarda a
            # ultima que viu e so age quando o numero muda. Perguntar quatro
            # vezes por segundo custa quase nada se a resposta quase sempre
            # for "igual ao que voce ja tem".
            self._versao += 1

    def descrever(self):
        return "guardado para {} buscar".format(self._descricao)

    def retrato(self):
        """O que o outro lado busca: versao e os canais acesos."""
        with self._lock:
            return {
                "versao": self._versao,
                "canais": {str(i + 1): v for i, v in enumerate(self._quadro) if v},
            }

    def reenviar(self):
        """Existe so para o app poder chamar sem saber qual driver esta ativo."""
        return None


# Nomes aceitos em luzes.driver. Ficam aqui, num lugar so, para o dia em que
# aparecer um driver novo: acrescenta o nome e a fabrica, e nada mais muda.
DRIVERS_CONHECIDOS = ("artnet", "agente", "nenhum")


def montar(config, modulador=None):
    """Escolhe o driver de luz pelo config. Devolve None quando nao ha luz.

    Este e o UNICO ponto do projeto que sabe que drivers existem. Quem chama
    recebe um objeto com aplicar() e descrever(), e nao precisa saber mais.

    `modulador` e opcional e so o driver artnet usa: e quem faz a luz andar.
    """
    driver = (config.get("driver") or "nenhum").strip().lower()

    if driver in ("nenhum", "none", ""):
        return None

    if driver == "agente":
        return ClienteAgente(config.get("quem_busca") or "outra maquina")

    if driver == "artnet":
        host = config.get("host")
        if not host:
            raise ErroLuzes("luzes.driver e artnet mas luzes.host esta vazio")
        return ClienteArtNet(
            host,
            config.get("universo", 0),
            reenvio_segundos=config.get("reenvio_segundos", 1.0),
            modulador=modulador,
        )

    raise ErroLuzes(
        "driver de luz desconhecido: {!r} (conhecidos: {})".format(
            driver, ", ".join(DRIVERS_CONHECIDOS)
        )
    )
