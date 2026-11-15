"""O seguidor — a metade do agente que roda na maquina que ALCANCA a luz.

Para que isto existe: a interface de luz da igreja esta atras de um roteador
com NAT. A maquina que conduz o culto (e que serve o painel que todo mundo
abre) nao alcanca a interface; esta aqui alcanca. E NAT so deixa passar
conexao de SAIDA.

Entao o sentido se inverte: em vez de a outra ponte empurrar comando, ESTA
aqui vai buscar. Quatro vezes por segundo pergunta "qual quadro e qual modo
deveriam estar no ar?" e aplica na luz local. Tudo de saida. Nenhuma mudanca
de rede.

O QUE VIAJA PELA REDE e so o quadro PARADO e o NOME do modo. O movimento e
calculado aqui, a 30 quadros por segundo, pelo mesmo ponte/movimento.py. Duas
razoes: mandar 30 quadros por segundo pela rede seria desperdicio, e qualquer
engasgo da rede apareceria como tremida na luz. Assim a rede so carrega
mudanca, e o movimento e local e suave.

QUANDO A OUTRA PONTE SOME, a luz FICA COMO ESTAVA. Nao apaga. Num culto, luz
que apaga sozinha porque a rede piscou e muito pior que luz parada no ultimo
estado — e o reenvio do ClienteArtNet continua segurando o quadro.
"""

import json
import threading
import time
import urllib.error
import urllib.request


class Seguidor:
    def __init__(self, url, cliente, movimento=None, intervalo=0.25,
                 timeout=3.0, aviso=print, saneamento=None):
        self._url = str(url).rstrip("/") + "/api/luz/quadro"
        self._cliente = cliente
        self._movimento = movimento
        self._intervalo = float(intervalo)
        self._timeout = float(timeout)
        self._aviso = aviso
        self._saneamento = self._ler_saneamento(saneamento or {})
        self._ja_reclamou = set()

        self._parar = threading.Event()
        self._thread = None
        self._visto = None          # (versao, modo) da ultima vez que agimos
        self._lock = threading.Lock()
        self._estado = {"ligado": False, "ultima": None, "erro": None,
                        "versao": None, "modo": None}

    # -- saneamento ---------------------------------------------------------
    #
    # ESTE E O PONTO EM QUE O DADO VIRA LUZ, e por isso e aqui que ele e
    # conferido. O quadro agora chega PELA REDE, de um painel SEM SENHA, numa
    # rede onde foram contados quase cem aparelhos — o wi-fi dos membros e o
    # mesmo segmento da producao. Qualquer um ali que ache a porta 8700 pode
    # mandar um quadro.
    #
    # Confiar em quem mandou seria errado por construcao. Entao o seguidor
    # sabe quais canais NUNCA devem sair do zero (estrobo, programa
    # automatico, reset das cabecas) e quais so aceitam valores seguros, e
    # aplica isso venha o quadro de onde vier.
    #
    # NAO HA EXCECAO, nem para o modo perigoso — e aqui houve uma correcao
    # que vale registrar, porque a primeira versao parecia certa e nao era.
    #
    # Ela abria uma brecha: com o modo perigoso ativo, o quadro do fio passava
    # INTEIRO. O nome do modo era validado localmente, mas o VALOR do estrobo
    # ainda vinha de fora. Bastava mandar o nome certo junto com o valor.
    #
    # Agora o quadro que chega e saneado SEMPRE. Quem escreve na faixa de
    # estrobo e so o motor local (movimento.py), depois, a partir do `valor`
    # que esta no config DESTA maquina. Assim a autorizacao E o valor sao
    # os dois locais, e a rede nao carrega estrobo em hipotese nenhuma.

    @staticmethod
    def _ler_saneamento(bruto):
        sempre_zero = set()
        for c in (bruto.get("sempre_zero") or []):
            try:
                sempre_zero.add(int(c))
            except (TypeError, ValueError):
                continue
        permitidos = {}
        for canal, valores in (bruto.get("so_estes_valores") or {}).items():
            try:
                permitidos[int(canal)] = {int(v) for v in valores}
            except (TypeError, ValueError):
                continue
        return {"sempre_zero": sempre_zero, "so_estes_valores": permitidos}

    def _sanear(self, quadro):
        barrados = []
        for canal in self._saneamento["sempre_zero"]:
            if quadro.get(canal):
                barrados.append((canal, quadro[canal]))
                quadro[canal] = 0
        for canal, permitidos in self._saneamento["so_estes_valores"].items():
            valor = quadro.get(canal)
            if valor is not None and valor not in permitidos:
                barrados.append((canal, valor))
                # Fecha, em vez de adivinhar o valor "proximo mais seguro":
                # refletor apagado e sempre uma escolha defensavel.
                quadro[canal] = 0
        return quadro, barrados

    # -- vida ---------------------------------------------------------------

    def comecar(self):
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._laco, daemon=True)
        self._thread.start()

    def parar(self):
        self._parar.set()
        if self._thread:
            self._thread.join(timeout=3.0)

    def retrato(self):
        with self._lock:
            return dict(self._estado)

    # -- laco ---------------------------------------------------------------

    def _laco(self):
        falhas_seguidas = 0
        while not self._parar.is_set():
            try:
                corpo = self._buscar()
                self._aplicar(corpo)
                if falhas_seguidas:
                    self._aviso("[seguidor] a ponte voltou")
                falhas_seguidas = 0
                with self._lock:
                    self._estado.update({"ligado": True, "ultima": time.time(),
                                         "erro": None,
                                         "versao": corpo.get("versao"),
                                         "modo": corpo.get("modo")})
            except Exception as erro:
                falhas_seguidas += 1
                # Reclama na PRIMEIRA falha e depois cala a boca. Repetir o
                # mesmo erro quatro vezes por segundo enche o registro e
                # esconde o que vier depois.
                if falhas_seguidas == 1:
                    self._aviso("[seguidor] perdi a ponte: {}".format(erro))
                with self._lock:
                    self._estado.update({"ligado": False, "erro": str(erro)})
                # A LUZ NAO APAGA. Fica no ultimo quadro, que o reenvio do
                # cliente continua mandando. Apagar sozinha por causa de um
                # engasgo de rede seria muito pior no meio do culto.

            # Com a ponte fora do ar, espaca as tentativas ate 2s: nao adianta
            # martelar, e assim o registro nao vira cachoeira.
            espera = self._intervalo if not falhas_seguidas else min(
                2.0, self._intervalo * min(falhas_seguidas, 8))
            if self._parar.wait(espera):
                return

    def _buscar(self):
        # "sabe=estudio" so AVISA a outra ponte de que este seguidor entende
        # a chave "estudio" do quadro, para a tela de la poder dizer se a
        # animacao vai aparecer na igreja. Uma ponte antiga ignora o aviso.
        requisicao = urllib.request.Request(self._url + "?sabe=estudio", method="GET")
        with urllib.request.urlopen(requisicao, timeout=self._timeout) as resposta:
            return json.loads(resposta.read().decode("utf-8"))

    def _aplicar(self, corpo):
        if "erro" in corpo:
            raise RuntimeError(corpo["erro"])

        # A animacao do Estudio de luz viaja numa chave A PARTE, e nao no
        # "modo". De proposito: um seguidor antigo so le versao, canais e
        # modo — e nesse caso o modo diz "parado", que ele entende. Ele fica
        # com a luz certa e parada, em vez de receber um nome que nao conhece.
        estudio = corpo.get("estudio")
        assinatura = (corpo.get("versao"), corpo.get("modo"),
                      json.dumps(estudio, sort_keys=True) if estudio is not None else None)
        if assinatura == self._visto:
            return      # nada mudou; o caso comum, e sai barato

        canais = corpo.get("canais") or {}
        if not isinstance(canais, dict):
            raise ValueError("canais veio num formato estranho")

        # ZERA TUDO ANTES. O retrato traz so os canais acesos — e assim deve
        # ser, senao viajam 512 numeros a cada mudanca. Mas entao aplicar
        # direto deixaria aceso o que a cena anterior acendeu e esta nao
        # menciona. Uma cena e estado absoluto, nao ajuste sobre o anterior.
        quadro = {numero: 0 for numero in range(1, 513)}
        descartados = 0
        for canal, valor in canais.items():
            # Canal ou valor fora da faixa e DESCARTADO aqui, em vez de deixar
            # o cliente levantar excecao. Com excecao, um unico numero errado
            # vindo do fio impediria a CENA INTEIRA de entrar — e, pior, como
            # a versao nao mudaria, nunca mais seria tentada. Uma cena quase
            # inteira e muito melhor que nenhuma.
            try:
                numero, nivel = int(canal), int(valor)
            except (TypeError, ValueError):
                descartados += 1
                continue
            if 1 <= numero <= 512 and 0 <= nivel <= 255:
                quadro[numero] = nivel
            else:
                descartados += 1
        if descartados:
            self._aviso("[seguidor] descartei {} canal(is) fora da faixa".format(descartados))

        quadro, barrados = self._sanear(quadro)
        if barrados:
            # Reclama uma vez por canal e cala. Se alguem estiver martelando
            # a porta, o registro nao pode virar cachoeira — mas o primeiro
            # aviso precisa aparecer, porque ele e a evidencia.
            novos = [b for b in barrados if b[0] not in self._ja_reclamou]
            for canal, _ in barrados:
                self._ja_reclamou.add(canal)
            if novos:
                self._aviso("[seguidor] barrei valor inseguro em {}".format(
                    ", ".join("canal {} = {}".format(c, v) for c, v in novos)))

        # Se isto levantar — rede caiu no meio do envio, por exemplo —, a
        # assinatura NAO e gravada, e a proxima volta tenta de novo. Marcar
        # como visto antes de aplicar deixaria a cena nova presa ate alguem
        # mexer no painel outra vez.
        self._cliente.aplicar(quadro)

        if self._movimento is not None and estudio is not None:
            # A especificacao que chega e conferida de novo AQUI, pelo motor
            # desta maquina: velocidade, raio e cerca de pan/tilt saem das
            # tabelas locais, nunca do fio. Se nao der para entender, PARADO.
            try:
                if self._movimento.definir_estudio(estudio) is None:
                    self._movimento.escolher(corpo.get("modo") or "parado")
            except Exception as erro:
                self._movimento.escolher("parado")
                self._aviso("[seguidor] animacao do estudio recusada: {}".format(erro))
        elif self._movimento is not None:
            try:
                self._movimento.escolher(corpo.get("modo") or "parado")
            except Exception as erro:
                # Modo que nao existe aqui (config diferente entre as duas
                # maquinas) nao pode impedir a CENA de entrar. Luz certa
                # parada e muito melhor que luz errada mexendo.
                self._aviso("[seguidor] modo recusado: {}".format(erro))

        self._visto = assinatura
