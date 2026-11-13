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
            return None
        chave = str(nome)
        if chave not in self._modos:
            raise ErroMovimento("nao existe o modo {!r}".format(chave))
        with self._lock:
            self._atual = chave
        return chave

    def atual(self):
        with self._lock:
            return self._atual

    def ativo(self):
        return self.atual() is not None

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
            return quadro
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
