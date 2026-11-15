"""Movimento da luz — a modulacao que corre por cima da cena.

A IDEIA CENTRAL, e e o que impede isso de virar um pesadelo: CENA E COR,
MODO E MOVIMENTO, e os dois sao independentes.

A cena diz onde cada canal fica parado. O modo diz como alguns desses canais
variam no tempo. Trocar de cena nao para o movimento; trocar de modo nao
muda a cor. E o modo "parado" devolve EXATAMENTE a cena, sem residuo, porque
a modulacao nunca e escrita no quadro base — e calculada na hora de enviar.

Sem essa separacao seria preciso uma cena para "louvor azul parado", outra
para "louvor azul animado", outra para "louvor roxo lento"... multiplicando
sem fim.

O QUE SE MEXE, E O QUE NAO
--------------------------
  teto (cabecas moveis)  pan e tilt de verdade — e a unica coisa que anda
  cortina (pares fixos)  so INTENSIDADE; par fixo nao se move
  barra                  so intensidade
  luz de frente          NADA. Ela ilumina quem esta no altar e e o que a
                         camera precisa. Movimento e sempre detalhe atras.

SOBRE PULSAR E ESTROBAR, que parecem a mesma coisa e nao sao
-----------------------------------------------------------
PULSAR e a intensidade subindo e descendo suave, pelo canal de brilho. A um
pulso por segundo, com bordas macias, e o que toda igreja usa no louvor.

ESTROBAR e o flash interno do refletor, pelo canal de obturador: rapido e
duro. E o que oferece risco a quem tem epilepsia fotossensivel.

Esta modulo faz os dois, mas eles NAO sao intercambiaveis: o estrobo so
existe num modo proprio, marcado, que ninguem liga sem querer — e nenhuma
cue do culto pode escolher um modo. Ver `perigoso` nos modos.
"""

import math
import threading


class ErroMovimento(Exception):
    pass


def _fracao(x):
    """Parte fracionaria, sempre em [0,1). Serve de relogio ciclico."""
    return x - math.floor(x)


def _seno01(fase):
    """Senoide deslocada para [0,1], comecando no minimo. Subida e descida
    suaves — e a diferenca entre pulsar e piscar."""
    return (1.0 - math.cos(2.0 * math.pi * fase)) / 2.0


def _dente(fase, largura):
    """Um pulso que sobe rapido e decai, dentro de uma janela da fase.

    Serve para 'batida': a luz bate e some, em vez de respirar. Fora da
    janela devolve 0.
    """
    if fase >= largura:
        return 0.0
    dentro = fase / largura
    # sobe nos primeiros 15%, decai no resto
    if dentro < 0.15:
        return dentro / 0.15
    return max(0.0, 1.0 - (dentro - 0.15) / 0.85)


class Movimento:
    """Guarda os modos e sabe aplicar o modo atual sobre um quadro.

    Nao tem thread propria: quem chama e o cliente de luz, no momento de
    enviar. Assim o movimento e sempre coerente com o que vai no fio.
    """

    def __init__(self, grupos, modos):
        self._grupos = self._validar_grupos(grupos or {})
        self._modos = self._validar_modos(modos or {})
        self._atual = None
        # A animacao do Estudio de luz (/estudio). None = nao ha. Ver o fim
        # deste arquivo. Enquanto ninguem usa o estudio, isto fica None e o
        # motor se comporta exatamente como antes de o estudio existir.
        self._estudio = None
        self._lock = threading.Lock()

    # -- configuracao --------------------------------------------------------

    @staticmethod
    def _validar_grupos(grupos):
        limpos = {}
        for nome, g in grupos.items():
            if not isinstance(g, dict):
                continue
            bases = [int(b) for b in (g.get("bases") or [])]
            if not bases:
                continue
            limpos[str(nome)] = {
                "bases": bases,
                "brilho": g.get("brilho"),
                # Refletor SEM canal de brilho (RGBW direto, como a barra): a
                # intensidade e a propria cor, entao modular quer dizer
                # escalar os quatro canais juntos, preservando a proporcao.
                "cores": [int(c) for c in (g.get("cores") or [])],
                # So o Estudio de luz le isto: ONDE ficam os canais de cor do
                # refletor. Os modos do culto nunca olham para ca.
                "paleta": [int(c) for c in (g.get("paleta") or [])],
                "pan": g.get("pan"),
                "tilt": g.get("tilt"),
                "obturador": g.get("obturador"),
            }
        return limpos

    def _validar_modos(self, modos):
        limpos = {}
        for nome, m in modos.items():
            if not isinstance(m, dict):
                continue
            limpos[str(nome)] = {
                "nome": str(m.get("nome") or nome),
                "descricao": str(m.get("descricao") or ""),
                "energia": int(m.get("energia", 0)),
                "perigoso": bool(m.get("perigoso")),
                "efeitos": [e for e in (m.get("efeitos") or []) if isinstance(e, dict)],
            }
        return limpos

    def catalogo(self):
        """Os modos, na ordem de energia — e isso e de proposito: o painel
        mostra do mais calmo ao mais agitado, entao a fileira de botoes vira
        uma regua em vez de uma lista."""
        itens = [
            {
                "id": chave,
                "nome": m["nome"],
                "descricao": m["descricao"],
                "energia": m["energia"],
                "perigoso": m["perigoso"],
            }
            for chave, m in self._modos.items()
        ]
        return sorted(itens, key=lambda i: (i["energia"], i["nome"]))

    # -- escolha -------------------------------------------------------------

    def escolher(self, nome):
        """None, "" ou "parado" desligam o movimento."""
        if nome in (None, "", "parado"):
            with self._lock:
                self._atual = None
                # "Parado" para TUDO, inclusive o que o estudio deixou
                # rodando: e o botao de abortar, e nao pode sobrar movimento.
                self._estudio = None
            return None
        chave = str(nome)
        if chave not in self._modos:
            raise ErroMovimento("nao existe o modo {!r}".format(chave))
        with self._lock:
            self._atual = chave
            self._estudio = None    # modo do culto e estudio nao se somam
        return chave

    def atual(self):
        with self._lock:
            return self._atual

    def ativo(self):
        with self._lock:
            return self._atual is not None or self._estudio is not None

    def e_perigoso(self, nome):
        """Se ESTE lado considera o modo perigoso.

        A pergunta e deliberadamente respondida com o config LOCAL, nunca com
        o que veio pela rede. O nome do modo chega de fora; a decisao sobre o
        que aquele nome autoriza fica aqui.
        """
        modo = self._modos.get(str(nome or ""))
        return bool(modo and modo["perigoso"])

    # -- aplicacao -----------------------------------------------------------

    def aplicar(self, quadro, t):
        """Modula `quadro` (bytearray de 512) no instante t, EM CIMA da cena.

        Recebe uma COPIA do quadro base e devolve ela modificada. Nunca mexe
        no original: e isso que faz "parado" voltar exatamente para a cena.
        """
        chave = self.atual()
        if chave is None:
            return self._aplicar_estudio(quadro, t)
        for efeito in self._modos[chave]["efeitos"]:
            try:
                self._um_efeito(quadro, t, efeito)
            except Exception:
                # Um efeito mal escrito no config nao pode derrubar a luz
                # inteira no meio do culto. Ele simplesmente nao acontece.
                continue
        return quadro

    def _um_efeito(self, quadro, t, efeito):
        grupo = self._grupos.get(str(efeito.get("grupo")))
        if not grupo:
            return
        tipo = str(efeito.get("tipo") or "")
        periodo = float(efeito.get("periodo") or 0)
        if periodo <= 0:
            return
        defasagem = float(efeito.get("defasagem") or 0)
        bases = grupo["bases"]

        for indice, base in enumerate(bases):
            fase = _fracao(t / periodo + defasagem * indice)

            if tipo in ("respirar", "onda", "batida"):
                self._intensidade(quadro, grupo, base, tipo, fase, efeito)
            elif tipo == "circulo":
                self._circulo(quadro, grupo, base, fase, efeito, indice)
            elif tipo == "pendulo":
                self._pendulo(quadro, grupo, base, fase, efeito)
            elif tipo == "estrobo":
                self._estrobo(quadro, grupo, base, efeito)

    def _intensidade(self, quadro, grupo, base, tipo, fase, efeito):
        """Multiplica o brilho que a CENA definiu. A COR NUNCA MUDA — e por
        isso o mesmo modo serve para uma cena azul e uma cena ambar, sem
        precisar de um modo por cor."""
        minimo = float(efeito.get("minimo", 0.0))
        if tipo == "respirar":
            fator = minimo + (1.0 - minimo) * _seno01(fase)
        elif tipo == "onda":
            fator = minimo + (1.0 - minimo) * _dente(fase, float(efeito.get("largura", 0.45)))
        else:   # batida
            fator = minimo + (1.0 - minimo) * _dente(fase, float(efeito.get("largura", 0.25)))

        deslocamentos = []
        if grupo.get("brilho") is not None:
            deslocamentos = [int(grupo["brilho"])]
        elif grupo.get("cores"):
            deslocamentos = [int(c) for c in grupo["cores"]]
        if not deslocamentos:
            return

        canais = [base + d for d in deslocamentos]
        canais = [c for c in canais if 1 <= c <= 512]
        # Apagado na cena fica apagado: um modo nunca ACENDE o que a cena
        # deixou escuro. Ele so modula o que ja estava la.
        if not any(quadro[c - 1] for c in canais):
            return
        for c in canais:
            quadro[c - 1] = max(0, min(255, int(round(quadro[c - 1] * fator))))

    def _limites(self, efeito):
        return (int(efeito.get("pan_min", 0)), int(efeito.get("pan_max", 255)),
                int(efeito.get("tilt_min", 0)), int(efeito.get("tilt_max", 255)))

    @staticmethod
    def _centro(quadro, grupo, base, efeito):
        """Em volta de QUE PONTO o movimento gira.

        Por padrao, em volta de onde a CENA apontou a cabeca — nao de um
        numero fixo no config. Essa inversao importa: com o centro no
        config, quem quisesse corrigir a mira teria que editar YAML e
        reiniciar, e so eu sabia onde mexer. Com o centro vindo da cena,
        quem opera mira pelo ajuste fino do painel, olhando a luz, e o
        movimento passa a girar ali.

        centro_pan / centro_tilt no efeito ainda funcionam, para quando se
        quiser um ponto fixo independente da cena.
        """
        def de(nome, deslocamento, padrao=128):
            if efeito.get(nome) is not None:
                return float(efeito[nome])
            if deslocamento is None:
                return float(padrao)
            canal = base + int(deslocamento)
            if 1 <= canal <= 512:
                return float(quadro[canal - 1])
            return float(padrao)

        return (de("centro_pan", grupo.get("pan")),
                de("centro_tilt", grupo.get("tilt")))

    def _escrever_posicao(self, quadro, grupo, base, pan, tilt, efeito):
        # CABECA APAGADA NAO SE MEXE. Sem isto, deixar um modo ligado e
        # apagar a luz faz os motores continuarem girando no escuro: barulho
        # de motor durante a oracao, e desgaste a toa. O refletor so anda
        # quando ele esta de fato aceso.
        obturador = grupo.get("obturador")
        if obturador is not None:
            canal = base + int(obturador)
            if 1 <= canal <= 512 and quadro[canal - 1] == 0:
                return

        pmin, pmax, tmin, tmax = self._limites(efeito)
        for deslocamento, valor, lo, hi in (
            (grupo.get("pan"), pan, pmin, pmax),
            (grupo.get("tilt"), tilt, tmin, tmax),
        ):
            if deslocamento is None:
                continue
            canal = base + int(deslocamento)
            if not 1 <= canal <= 512:
                continue
            # O limite existe para o facho nao subir ate a camera nem varrer o
            # rosto das pessoas. E um cerco, nao uma sugestao.
            quadro[canal - 1] = max(0, min(255, max(lo, min(hi, int(round(valor))))))

    def _circulo(self, quadro, grupo, base, fase, efeito, indice):
        centro_pan, centro_tilt = self._centro(quadro, grupo, base, efeito)
        raio = float(efeito.get("raio", 25))
        inverter = indice in set(efeito.get("inverter") or [])
        angulo = 2.0 * math.pi * (-fase if inverter else fase)
        self._escrever_posicao(
            quadro, grupo, base,
            centro_pan + raio * math.cos(angulo),
            centro_tilt + raio * math.sin(angulo),
            efeito,
        )

    def _pendulo(self, quadro, grupo, base, fase, efeito):
        centro_pan, centro_tilt = self._centro(quadro, grupo, base, efeito)
        raio = float(efeito.get("raio", 30))
        self._escrever_posicao(
            quadro, grupo, base,
            centro_pan + raio * math.sin(2.0 * math.pi * fase),
            centro_tilt,
            efeito,
        )

    def _estrobo(self, quadro, grupo, base, efeito):
        """O UNICO lugar do projeto que escreve na faixa de estrobo.

        Nao calcula nada no tempo: poe o canal de obturador no valor pedido e
        deixa o proprio refletor piscar. Existe num modo marcado `perigoso`,
        que o painel desenha separado e nenhuma cue pode escolher.
        """
        deslocamento = grupo.get("obturador")
        if deslocamento is None:
            return
        canal = base + int(deslocamento)
        if not 1 <= canal <= 512:
            return

        # Refletor apagado na cena continua apagado. Onde olhar para saber
        # isso muda com o modelo: na cabeca movel e o proprio obturador, mas
        # na cortina o canal de estrobo vive em zero mesmo com o refletor
        # aceso — quem diz se ela esta ligada e o BRILHO. Por isso `guarda`
        # e configuravel; sem ela, a cortina nunca estrobaria.
        guarda = efeito.get("guarda", deslocamento)
        canal_guarda = base + int(guarda)
        if 1 <= canal_guarda <= 512 and quadro[canal_guarda - 1] == 0:
            return

        quadro[canal - 1] = max(0, min(255, int(efeito.get("valor", 180))))

    # ======================================================================
    #  ESTUDIO DE LUZ  (/estudio)
    #
    #  Uma animacao avulsa, montada na tela do estudio: UM tipo, com
    #  velocidade, tamanho e atraso, valendo so para as luzes escolhidas.
    #  Nao e um modo do culto, nao mora no config e nenhuma cue a alcanca.
    #
    #  TRES REGRAS QUE DESENHARAM ISTO
    #
    #  1. PELA REDE SO VIAJAM NUMEROS DE 0 A 100. Periodo, raio e limite de
    #     pan/tilt sao calculados AQUI, de cada lado, a partir das tabelas
    #     abaixo. Quem manda um quadro nao consegue pedir uma cabeca mais
    #     rapida ou mais longe do que estas tabelas deixam — mesma ideia do
    #     saneamento do seguidor: a decisao e sempre local.
    #
    #  2. NADA AQUI E MAIS SOLTO QUE OS MODOS DO CULTO. O circulo mais rapido
    #     do config (celebracao) e 3,5 s com raio 58; o pendulo, 6,5 s com
    #     raio 62; a cerca mais apertada de pan/tilt e 64-192. Os tetos
    #     abaixo ficam nesses numeros ou abaixo deles, ja contando a
    #     abertura gradual do raio.
    #
    #  3. O ESTROBO NAO EXISTE AQUI. "Piscar forte" na tela do estudio chama
    #     o modo perigoso que ja existia, pela mesma rota e com confirmacao.
    #     Este bloco nao escreve no canal de obturador em hipotese nenhuma.
    #
    #  E O SEGUIDOR ANTIGO? Ele nao conhece nada disto. A especificacao viaja
    #  numa chave nova do quadro ("estudio"), que ele ignora, e o campo
    #  "modo" continua dizendo "parado" — que ele entende. Resultado: do lado
    #  de la a luz fica PARADA na cor e na direcao certas. Ver seguidor.py.
    # ======================================================================

    ESTUDIO_INTENSIDADE = ("respirar", "onda", "batida")
    ESTUDIO_DIRECAO = ("vai_e_vem", "circulo", "varrer")
    ESTUDIO_TIPOS = ESTUDIO_INTENSIDADE + ESTUDIO_DIRECAO + ("trocar_cores",)

    # (periodo com a velocidade em 0, periodo com a velocidade em 100), em
    # segundos. O segundo numero e o TETO de velocidade de cada tipo.
    ESTUDIO_PERIODO = {
        "respirar": (10.0, 2.5),
        "onda": (4.0, 0.75),          # 0,75 s e a onda de "celebracao"
        "batida": (2.0, 0.55),        # 0,55 s e a batida de "batida"
        "circulo": (20.0, 3.5),       # 3,5 s e o circulo de "celebracao"
        "vai_e_vem": (20.0, 6.5),     # 6,5 s e o "pendulo"
        "varrer": (20.0, 6.5),
        "trocar_cores": (12.0, 1.5),  # por COR; nunca chega perto de piscar
    }
    # Quantas batidas da musica cabem num ciclo, quando o tempo foi batido.
    # Se ainda assim o ciclo ficar mais curto que o teto acima, ele dobra ate
    # caber: a musica acelera, a cabeca nao.
    ESTUDIO_BATIDAS = {"respirar": 4, "onda": 1, "batida": 1, "circulo": 8,
                       "vai_e_vem": 8, "varrer": 8, "trocar_cores": 4}
    ESTUDIO_BPM = (40, 200)
    # Raio maximo, em passos de pan/tilt, com o tamanho em 100. Um pouco
    # abaixo dos 58 e 62 do config, para sobrar folga para a abertura.
    ESTUDIO_RAIO = {"circulo": 56.0, "vai_e_vem": 58.0, "varrer": 56.0}
    # A cerca de pan/tilt. E a mais apertada que os modos do culto usam.
    ESTUDIO_CERCA = {"pan_min": 64, "pan_max": 192, "tilt_min": 64, "tilt_max": 192}
    # Ate onde a intensidade desce com o tamanho em 100 (fracao da cena).
    ESTUDIO_MINIMO = 0.2
    # Atraso em 100 = meia volta entre uma luz e a proxima (uma vai, a outra
    # volta). E a maior defasagem que os modos do culto usam.
    ESTUDIO_DEFASAGEM = 0.5
    # O raio nao aparece de uma vez: abre aos poucos, para a cabeca nao dar
    # um tranco quando a animacao liga ou o tamanho sobe. Passos por segundo.
    ESTUDIO_ABERTURA = 20.0
    # O freio: quantos passos de pan/tilt por segundo a saida pode andar, no
    # maximo, aconteca o que acontecer. 104 e o pico do circulo de
    # "celebracao" (2*pi*58/3,5); 60 e o pico do "pendulo" (2*pi*62/6,5).
    ESTUDIO_VELOCIDADE = {"circulo": 104.0, "vai_e_vem": 60.0, "varrer": 60.0}
    ESTUDIO_MAX_CORES = 6

    @staticmethod
    def _numero_0_100(bruto, nome, padrao):
        """Limita a 0-100. Recusa o que nem numero e."""
        if bruto is None:
            return padrao
        erro = ErroMovimento("{} precisa ser um numero de 0 a 100".format(nome))
        if isinstance(bruto, bool):
            raise erro
        try:
            valor = float(bruto)
        except (TypeError, ValueError):
            raise erro
        if not math.isfinite(valor):
            raise erro
        return int(round(max(0.0, min(100.0, valor))))

    def _bases_do_estudio(self):
        """{endereco: nome do grupo}. So o que esta em grupos_de_luz entra —
        e a luz de frente nao esta la, de proposito."""
        mapa = {}
        for nome, grupo in self._grupos.items():
            for base in grupo["bases"]:
                mapa.setdefault(base, nome)
        return mapa

    @staticmethod
    def _paleta_de(grupo):
        """Onde ficam os canais de cor do grupo, segundo o config LOCAL."""
        return list(grupo.get("paleta") or grupo.get("cores") or [])

    def capacidades_estudio(self):
        """O que da para animar em cada endereco, para a tela desenhar."""
        saida = {}
        for nome, grupo in self._grupos.items():
            paleta = self._paleta_de(grupo)
            for base in grupo["bases"]:
                saida.setdefault(str(base), {
                    "grupo": nome,
                    "intensidade": grupo.get("brilho") is not None or bool(paleta),
                    "direcao": grupo.get("pan") is not None or grupo.get("tilt") is not None,
                    "cores": len(paleta),
                })
        return saida

    def limites_estudio(self):
        """Os tetos, para a tela mostrar e os testes conferirem."""
        return {
            "periodo": {t: list(p) for t, p in self.ESTUDIO_PERIODO.items()},
            "raio": dict(self.ESTUDIO_RAIO),
            "cerca": dict(self.ESTUDIO_CERCA),
            "bpm": list(self.ESTUDIO_BPM),
            "minimo": self.ESTUDIO_MINIMO,
        }

    def normalizar_estudio(self, bruto):
        """Confere o pedido e devolve a especificacao LIMPA, ou None (parado).

        Levanta ErroMovimento para o que nao da para entender. Numero fora de
        0-100 e LIMITADO; tipo desconhecido, texto onde devia ter numero e
        lista vazia de luzes sao RECUSADOS. Luz que este lado nao conhece
        como animavel (a de frente, por exemplo) e simplesmente deixada de
        fora: ela nunca entra em animacao, peca quem pedir.
        """
        if bruto is None:
            return None
        if not isinstance(bruto, dict):
            raise ErroMovimento("a animacao veio num formato estranho")
        tipo = str(bruto.get("tipo") or "parado")
        if tipo == "parado":
            return None
        if tipo not in self.ESTUDIO_TIPOS:
            # Inclui "estrobo" e "piscar_forte": nao existem aqui.
            raise ErroMovimento("nao existe a animacao {!r}".format(tipo))

        conhecidas = self._bases_do_estudio()
        pedidas = bruto.get("luzes")
        if not isinstance(pedidas, (list, tuple)):
            raise ErroMovimento("faltou dizer em quais luzes")
        luzes = []
        for item in pedidas:
            if isinstance(item, bool):
                continue
            try:
                base = int(item)
            except (TypeError, ValueError):
                continue
            if base in conhecidas and base not in luzes:
                luzes.append(base)
        if not luzes:
            raise ErroMovimento("nenhuma das luzes escolhidas pode ser animada")

        limpo = {
            "tipo": tipo,
            "luzes": sorted(luzes),
            "velocidade": self._numero_0_100(bruto.get("velocidade"), "velocidade", 35),
            "tamanho": self._numero_0_100(bruto.get("tamanho"), "tamanho", 50),
            "atraso": self._numero_0_100(bruto.get("atraso"), "atraso", 0),
            "espelhar": bruto.get("espelhar") is True,
            "bpm": None,
        }

        bpm = bruto.get("bpm")
        if bpm is not None:
            erro = ErroMovimento("o tempo da musica precisa ser um numero")
            if isinstance(bpm, bool):
                raise erro
            try:
                bpm = float(bpm)
            except (TypeError, ValueError):
                raise erro
            if not math.isfinite(bpm):
                raise erro
            limpo["bpm"] = int(round(max(self.ESTUDIO_BPM[0], min(self.ESTUDIO_BPM[1], bpm))))

        if tipo == "trocar_cores":
            limpo["cores"] = self._normalizar_cores(bruto.get("cores"))
        return limpo

    def _normalizar_cores(self, bruto):
        """[{"4": [r,g,b,w], "5": [r,g,b,w,a]}, ...] — uma entrada por COR, e
        dentro dela os valores para refletor de 4 e de 5 canais de cor.

        Repare no que NAO vem: numero de canal. Onde escrever e decidido pela
        `paleta` do config deste lado; de fora chegam so os valores."""
        if not isinstance(bruto, (list, tuple)) or len(bruto) < 2:
            raise ErroMovimento("trocar cores precisa de pelo menos duas cores")
        if len(bruto) > self.ESTUDIO_MAX_CORES:
            raise ErroMovimento("cores demais (maximo {})".format(self.ESTUDIO_MAX_CORES))
        cores = []
        for item in bruto:
            if not isinstance(item, dict):
                raise ErroMovimento("uma das cores veio num formato estranho")
            cor = {}
            for tamanho, valores in item.items():
                if str(tamanho) not in ("3", "4", "5") or not isinstance(valores, (list, tuple)):
                    continue
                if len(valores) != int(tamanho):
                    raise ErroMovimento("uma das cores veio com valores de menos ou de mais")
                try:
                    cor[str(tamanho)] = [max(0, min(255, int(v))) for v in valores]
                except (TypeError, ValueError, OverflowError):
                    raise ErroMovimento("uma das cores tem valor que nao e numero")
            if not cor:
                raise ErroMovimento("uma das cores veio vazia")
            cores.append(cor)
        return cores

    def _periodo_estudio(self, limpo):
        tipo = limpo["tipo"]
        lento, rapido = self.ESTUDIO_PERIODO[tipo]
        if limpo.get("bpm"):
            periodo = 60.0 / limpo["bpm"] * self.ESTUDIO_BATIDAS[tipo]
            while periodo < rapido:
                periodo *= 2.0
            return periodo
        fracao = limpo["velocidade"] / 100.0
        return max(rapido, lento * (rapido / lento) ** fracao)

    def definir_estudio(self, bruto):
        """Liga (ou troca) a animacao do estudio. None ou tipo "parado" desliga.

        Devolve a especificacao limpa — a que de fato vale, ja com os
        limites — ou None. Ligar uma animacao do estudio DESLIGA o modo do
        culto que estivesse rodando: os dois nunca se somam.
        """
        limpo = self.normalizar_estudio(bruto)
        with self._lock:
            if limpo is None:
                self._estudio = None
                return None
            anterior = self._estudio
            estado = {
                "espec": limpo,
                "periodo": self._periodo_estudio(limpo),
                "fase": 0.0,
                "raio": 0.0,
                "t": None,
                "posicao": {},      # {endereco: (pan, tilt)} da ultima saida
            }
            # Mexer num controle com a animacao rodando NAO recomeca nada: a
            # fase e o raio atual continuam de onde estavam. Sem isto, cada
            # toque na velocidade faria a cabeca saltar para outro ponto do
            # circulo. E a ultima posicao passa adiante SEMPRE, mesmo trocando
            # de animacao: e dela que o freio de velocidade parte.
            if anterior is not None:
                estado["t"] = anterior["t"]
                estado["posicao"] = dict(anterior["posicao"])
                if anterior["espec"]["tipo"] == limpo["tipo"]:
                    estado["fase"] = anterior["fase"]
                    estado["raio"] = anterior["raio"]
            self._estudio = estado
            self._atual = None
        return dict(limpo)

    def estudio(self):
        """A especificacao que esta valendo, ou None."""
        with self._lock:
            return dict(self._estudio["espec"]) if self._estudio else None

    def estudio_detalhe(self):
        """O que os numeros de 0 a 100 viraram de verdade. So para a tela."""
        with self._lock:
            if not self._estudio:
                return None
            espec = self._estudio["espec"]
            return {
                "periodo": round(self._estudio["periodo"], 3),
                "raio": round(self.ESTUDIO_RAIO.get(espec["tipo"], 0.0)
                              * espec["tamanho"] / 100.0, 1),
            }

    def _aplicar_estudio(self, quadro, t):
        with self._lock:
            estado = self._estudio
        if estado is None:
            return quadro
        try:
            self._passo_estudio(quadro, t, estado)
        except Exception:
            # Mesma regra dos modos: animacao com defeito nao derruba a luz.
            pass
        return quadro

    def _passo_estudio(self, quadro, t, estado):
        espec = estado["espec"]
        tipo = espec["tipo"]

        # O RELOGIO E ACUMULADO, nao t/periodo. Com t/periodo, trocar a
        # velocidade no meio muda a fase de repente — e fase de repente, numa
        # cabeca movel, e um tranco. Acumulando, a velocidade muda e a
        # posicao continua de onde estava.
        anterior = estado["t"]
        passo = 0.0 if anterior is None else max(0.0, min(0.25, t - anterior))
        estado["t"] = t
        estado["fase"] += passo / estado["periodo"]
        if tipo != "trocar_cores":
            # Na troca de cores a fase conta CORES e da a volta sozinha la.
            estado["fase"] = _fracao(estado["fase"])

        if tipo in self.ESTUDIO_DIRECAO:
            alvo = self.ESTUDIO_RAIO[tipo] * espec["tamanho"] / 100.0
            folga = self.ESTUDIO_ABERTURA * passo
            estado["raio"] += max(-folga, min(folga, alvo - estado["raio"]))

        defasagem = self.ESTUDIO_DEFASAGEM * espec["atraso"] / 100.0
        escolhidas = set(espec["luzes"])
        if tipo not in self.ESTUDIO_DIRECAO:
            escolhidas_que_andam = set()
        else:
            escolhidas_que_andam = escolhidas
        # Cabeca que estava andando e SAIU da animacao (trocaram as luzes, ou
        # a animacao virou uma de intensidade) nao salta de volta: caminha
        # ate onde a cena aponta, no mesmo freio, e so entao e esquecida.
        for base in [b for b in estado["posicao"] if b not in escolhidas_que_andam]:
            self._estudio_recolher(quadro, estado, base, passo)

        for grupo in self._grupos.values():
            indice = 0
            for base in grupo["bases"]:
                if base not in escolhidas:
                    continue
                fase = estado["fase"] + defasagem * indice
                if tipo in self.ESTUDIO_INTENSIDADE:
                    self._estudio_intensidade(quadro, grupo, base, tipo, _fracao(fase), espec)
                elif tipo in self.ESTUDIO_DIRECAO:
                    self._estudio_direcao(quadro, grupo, base, tipo, _fracao(fase),
                                          estado, passo, indice)
                else:
                    self._estudio_cores(quadro, grupo, base, fase, espec)
                indice += 1

    def _estudio_intensidade(self, quadro, grupo, base, tipo, fase, espec):
        minimo = 1.0 - (1.0 - self.ESTUDIO_MINIMO) * espec["tamanho"] / 100.0
        alvo = grupo
        if grupo.get("brilho") is None and not grupo.get("cores") and grupo.get("paleta"):
            # Refletor sem canal de brilho (o teto): escala a cor inteira.
            alvo = dict(grupo, cores=grupo["paleta"])
        self._intensidade(quadro, alvo, base, tipo, fase, {"minimo": minimo})

    def _estudio_recolher(self, quadro, estado, base, passo):
        grupo = self._grupos.get(self._bases_do_estudio().get(base))
        if grupo is None:
            del estado["posicao"][base]
            return
        casa = self._centro(quadro, grupo, base, {})
        folga = min(self.ESTUDIO_VELOCIDADE.values()) * passo
        ultima = estado["posicao"][base]
        pan = ultima[0] + max(-folga, min(folga, casa[0] - ultima[0]))
        tilt = ultima[1] + max(-folga, min(folga, casa[1] - ultima[1]))
        if abs(pan - casa[0]) < 0.5 and abs(tilt - casa[1]) < 0.5:
            del estado["posicao"][base]     # chegou: a cena volta a mandar
            return
        estado["posicao"][base] = (pan, tilt)
        self._escrever_posicao(quadro, grupo, base, pan, tilt, {})

    def _estudio_direcao(self, quadro, grupo, base, tipo, fase, estado, passo, indice):
        if grupo.get("pan") is None and grupo.get("tilt") is None:
            return      # par fixo nao se move
        espec, raio = estado["espec"], estado["raio"]
        centro_pan, centro_tilt = self._centro(quadro, grupo, base, {})
        # ESPELHAR: uma sim, uma nao, faz o contrario da vizinha.
        sinal = -1.0 if (espec["espelhar"] and indice % 2 == 1) else 1.0
        angulo = 2.0 * math.pi * fase
        if tipo == "circulo":
            pan = centro_pan + raio * math.cos(sinal * angulo)
            tilt = centro_tilt + raio * math.sin(sinal * angulo)
        elif tipo == "vai_e_vem":
            pan = centro_pan + sinal * raio * math.sin(angulo)
            tilt = centro_tilt
        else:   # varrer
            pan = centro_pan
            tilt = centro_tilt + sinal * raio * math.sin(angulo)

        # O FREIO. Seja qual for a conta acima, a posicao que sai daqui nunca
        # anda mais que ESTUDIO_VELOCIDADE passos por segundo. E o que segura
        # a cabeca quando alguem troca de animacao, mexe no atraso ou arrasta
        # a direcao com tudo rodando: em vez de saltar, ela vai ate la.
        cerca = self.ESTUDIO_CERCA
        pan = max(cerca["pan_min"], min(cerca["pan_max"], pan))
        tilt = max(cerca["tilt_min"], min(cerca["tilt_max"], tilt))
        ultima = estado["posicao"].get(base)
        if ultima is None:
            # Primeira vez: parte de onde a cena deixou a cabeca — mesmo que
            # seja fora da cerca (o forro, por exemplo). Dali ela CAMINHA
            # para dentro, em vez de saltar.
            ultima = (centro_pan, centro_tilt)
        folga = self.ESTUDIO_VELOCIDADE[tipo] * passo
        pan = ultima[0] + max(-folga, min(folga, pan - ultima[0]))
        tilt = ultima[1] + max(-folga, min(folga, tilt - ultima[1]))
        estado["posicao"][base] = (pan, tilt)

        # O ALVO ja foi posto dentro da cerca ali em cima, e a saida fica
        # sempre entre a posicao anterior e o alvo: nunca mais para fora do
        # que a propria cena ja tinha posto. Por isso aqui vai sem cerca (o
        # dicionario vazio = 0 a 255) — com ela, o caminho de volta do forro
        # viraria um salto. A outra protecao de _escrever_posicao continua
        # valendo: cabeca apagada nao se mexe.
        self._escrever_posicao(quadro, grupo, base, pan, tilt, {})

    def _estudio_cores(self, quadro, grupo, base, fase, espec):
        paleta = self._paleta_de(grupo)
        if not paleta:
            return      # este lado nao sabe onde fica a cor deste refletor
        canais = [base + int(d) for d in paleta]
        if not all(1 <= c <= 512 for c in canais):
            return
        # Apagado na cena fica apagado — vale para a cor, para o brilho e,
        # na cabeca movel, para o obturador.
        if not any(quadro[c - 1] for c in canais):
            return
        guardas = [grupo.get("brilho")]
        if grupo.get("pan") is not None or grupo.get("tilt") is not None:
            # So na cabeca movel: na cortina esse canal e o estrobo, e vive
            # em zero com o refletor aceso.
            guardas.append(grupo.get("obturador"))
        for deslocamento in guardas:
            if deslocamento is None:
                continue
            canal = base + int(deslocamento)
            if 1 <= canal <= 512 and quadro[canal - 1] == 0:
                return

        cores = [c.get(str(len(paleta))) for c in espec["cores"]]
        if any(c is None for c in cores):
            return
        total = len(cores)
        posicao = fase % total
        atual = int(posicao) % total
        dentro = posicao - int(posicao)
        # Fica 60% do tempo na cor e passa suave para a proxima nos 40%
        # finais. Sem corte seco: troca de cor nao pode parecer piscada.
        mistura = 0.0 if dentro < 0.6 else _seno01((dentro - 0.6) / 0.8)
        de, para = cores[atual], cores[(atual + 1) % total]
        for canal, a, b in zip(canais, de, para):
            quadro[canal - 1] = max(0, min(255, int(round(a + (b - a) * mistura))))
