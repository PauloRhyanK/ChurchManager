"""O condutor do louvor: quem passa a letra e troca a luz durante uma musica.

ANTES ISSO MORAVA NO NAVEGADOR (louvor.html): a aba que tocava o audio era
quem mandava. Se a aba fechasse, a letra parava; se duas pessoas abrissem, as
duas mandavam. Agora mora aqui, no PC principal, e as telas so mostram e
pedem. O estado e UM SO para todo mundo: nao existe "a minha tela esta em
manual e a sua nao".

O condutor nao conhece Flask, Holyrics nem luz. Recebe:
  relogio         de onde sai "em que segundo a musica esta" (relogio.py)
  musicas()       a lista do dia (repertorio.py)
  mostrar_musica  poe a musica no telao
  por_slide       poe um slide no telao (levanta excecao se falhar)
  por_luz         aplica a luz de uma parte
  anotar          escreve no "Aconteceu agora"
  tirar           tira a letra do telao (opcional; sem ele, "Tirar" e recusado)

REGRAS QUE NAO SE DISCUTEM:
  - So manda quando MUDA. Dez voltas por segundo nao podem virar dez pedidos.
  - Letra que falhou: uma segunda tentativa 0,7 s depois, e mais nenhuma ate
    o slide mudar. Com o Holyrics fechado, insistir so enche a rede.
  - Relogio sem sinal: a letra FICA ONDE ESTA. Quem decide e o operador.
  - Vale o ultimo toque, e o estado sempre diz de quem foi.
"""

import threading
import time

PAUSA = 0.1
RETENTAR_EM = 0.7
ACERTO_MAXIMO = 5.0


class Condutor:
    def __init__(self, relogio, musicas, mostrar_musica, por_slide, por_luz, anotar,
                 agora=time.monotonic, lembrado=None, guardar=None, tirar=None):
        self._relogio = relogio
        self._musicas = musicas
        self._mostrar_musica = mostrar_musica
        self._por_slide = por_slide
        self._por_luz = por_luz
        self._anotar = anotar
        self._agora = agora
        self._guardar = guardar
        self._tirar = tirar
        self._tranca = threading.RLock()

        self._id = None            # id da musica atual
        self._slide = None         # indice na sequencia de slides
        self._letra = "na_mao"     # "sozinho" | "na_mao"
        self._segurando = False
        self._luz = "na_mao"       # "seguindo" | "na_mao"
        self._quem = None
        self._andou = False        # o relogio ja conduziu esta musica?
        self._avisou_sem_sinal = False
        self._parte_da_luz = None  # ultima parte cuja luz foi aplicada
        self._luz_presa = None     # parte em que a luz ficou por um atalho
        self._erro_letra = None
        self._retentar_em = None
        self._ja_retentou = False
        # A letra foi tirada do telao: o tempo continua contando e o slide
        # continua sendo acompanhado, mas nada vai ao telao ate alguem voltar.
        self._fora = False

        if lembrado:
            # A ponte reiniciou no meio do louvor: volta na mesma musica, na
            # mao. Quem devolve e o operador, quando o relogio tiver sinal.
            for musica in self._lista():
                if musica["id"] == str(lembrado):
                    self._id = musica["id"]
                    self._slide = 0 if musica["slides"] else None
                    break

    # -- leitura -------------------------------------------------------------

    def _lista(self):
        try:
            return self._musicas() or []
        except Exception:
            return []

    def _atual(self, lista=None):
        lista = self._lista() if lista is None else lista
        for indice, musica in enumerate(lista):
            if musica["id"] == self._id:
                return indice, musica
        return None, None

    def _posicao(self, musica):
        """A posicao do relogio, se ele vale para ESTA musica. Senao None."""
        leitura = self._relogio.ler()
        if not leitura["sinal"] or leitura["posicao"] is None:
            return None, leitura
        if leitura["musica"] not in (None, musica["id"]):
            return None, leitura
        return leitura["posicao"], leitura

    @staticmethod
    def _slide_em(musica, posicao):
        achado = 0
        for indice, slide in enumerate(musica["slides"]):
            if slide["tempo"] is not None and slide["tempo"] <= posicao:
                achado = indice
        return achado

    @staticmethod
    def _parte_em(musica, posicao):
        achada = 0
        for indice, parte in enumerate(musica["partes"]):
            if parte["tempo"] is not None and parte["tempo"] <= posicao:
                achada = indice
        return achada

    # -- mandar --------------------------------------------------------------

    def _mandar_slide(self, musica, indice, primeira=True):
        """Poe o slide no telao. Devolve o erro, ou None se deu certo."""
        if indice is None or not 0 <= indice < len(musica["slides"]):
            return None
        with self._tranca:
            if self._fora:
                return None
        try:
            self._por_slide(musica, musica["slides"][indice])
        except Exception as erro:
            texto = str(erro)[:160] or "a letra não chegou ao telão"
            with self._tranca:
                if self._slide == indice and self._id == musica["id"]:
                    self._erro_letra = texto
                    if primeira and not self._ja_retentou:
                        self._retentar_em = self._agora() + RETENTAR_EM
            return texto
        with self._tranca:
            if self._slide == indice and self._id == musica["id"]:
                self._erro_letra = None
                self._retentar_em = None
        return None

    def _mandar_na_mao(self, musica, indice):
        """Um toque do operador poe o slide no telao. Se a letra tinha sido
        tirada, reabre a musica antes: passar o slide e voltar ao telao."""
        with self._tranca:
            reabrir, self._fora = self._fora, False
        if reabrir:
            try:
                self._mostrar_musica(musica)
            except Exception as falha:
                texto = str(falha)[:160] or "a letra não chegou ao telão"
                with self._tranca:
                    self._erro_letra = texto
                return texto
        return self._mandar_slide(musica, indice)

    def _mandar_luz(self, musica, indice):
        if indice is None or not 0 <= indice < len(musica["partes"]):
            return
        parte = musica["partes"][indice]
        if not parte.get("luz"):
            return
        try:
            self._por_luz(parte)
        except Exception as erro:
            self._anotar("Luz de " + parte["nome"], False, str(erro)[:160])

    def _trocar_slide(self, indice):
        """Chamar sob a tranca."""
        self._slide = indice
        self._retentar_em = None
        self._ja_retentou = False

    # -- a volta -------------------------------------------------------------

    def passo(self):
        slide = luz = None
        primeira = True
        notas = []
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return
            if not musica["pronta"] and self._letra == "sozinho":
                self._letra, self._segurando = "na_mao", False
            posicao, _ = self._posicao(musica)
            if posicao is not None:
                self._avisou_sem_sinal = False
                if self._letra == "sozinho":
                    if not self._andou:
                        self._andou = True
                        notas.append((musica["titulo"] + " começou sozinha", True, "tudo certo"))
                    alvo = self._slide_em(musica, posicao)
                    if not self._segurando and alvo != self._slide:
                        self._trocar_slide(alvo)
                        slide = alvo
                if self._luz == "seguindo" and self._luz_presa is None and musica["pronta"]:
                    parte = self._parte_em(musica, posicao)
                    if parte != self._parte_da_luz:
                        self._parte_da_luz = parte
                        luz = parte
            elif self._letra == "sozinho" and self._andou and not self._avisou_sem_sinal:
                self._avisou_sem_sinal = True
                notas.append((musica["titulo"] + ": sem o tempo da música", False,
                              "a letra ficou onde estava"))
            if slide is None and self._retentar_em is not None and self._agora() >= self._retentar_em:
                self._retentar_em = None
                self._ja_retentou = True
                slide, primeira = self._slide, False
        for nota in notas:
            self._anotar(*nota)
        if luz is not None:
            self._mandar_luz(musica, luz)
        if slide is not None:
            self._mandar_slide(musica, slide, primeira=primeira)

    def comecar(self):
        def laco():
            while True:
                try:
                    self.passo()
                except Exception as erro:
                    # Esta thread nao pode morrer no meio do louvor.
                    print("  [condutor] volta falhou: {}".format(erro))
                time.sleep(PAUSA)
        threading.Thread(target=laco, daemon=True).start()

    # -- retrato -------------------------------------------------------------

    def tem_musica(self):
        with self._tranca:
            return self._id is not None

    def retrato(self):
        with self._tranca:
            lista = self._lista()
            indice, musica = self._atual(lista)
            leitura = self._relogio.ler()
            itens = []
            for i, m in enumerate(lista):
                if indice is None:
                    estado = "a_seguir" if i == 0 else "depois"
                elif i < indice:
                    estado = "tocou"
                elif i == indice:
                    estado = "tocando"
                else:
                    estado = "a_seguir" if i == indice + 1 else "depois"
                itens.append({"id": m["id"], "titulo": m["titulo"], "pronta": m["pronta"], "estado": estado})
            corpo = {
                "ativo": bool(lista), "indice": indice, "total": len(lista), "lista": itens,
                "musica": None, "slide": None, "total_slides": 0, "parte": None,
                "letra": self._letra, "segurando": self._segurando, "luz": self._luz,
                "quem": self._quem, "motivo": None, "pode_devolver": False,
                "motivo_devolver": None, "tem_refrao": False, "proximo_em": None,
                "erro_letra": None, "acabou": False, "fora": self._fora,
                "relogio": {"fonte": leitura["fonte"], "posicao": None, "tocando": False,
                            "sinal": False, "duracao": None},
            }
            if musica is None:
                return corpo
            posicao, _ = self._posicao(musica)
            slides = musica["slides"]
            corpo.update({
                "musica": {"id": musica["id"], "titulo": musica["titulo"], "pronta": musica["pronta"],
                           "audio": musica["audio"], "tem_letra": musica["tem_letra"]},
                "slide": self._slide, "total_slides": len(slides),
                "parte": slides[self._slide]["parte"] if self._slide is not None and self._slide < len(slides) else None,
                "tem_refrao": any(p["tipo"] == "refrao" for p in musica["partes"]),
                "erro_letra": self._erro_letra,
            })
            corpo["relogio"].update({"posicao": posicao, "duracao": musica["duracao"],
                                     "tocando": bool(posicao is not None and leitura["tocando"]),
                                     "sinal": posicao is not None})
            if posicao is not None and musica["duracao"]:
                corpo["acabou"] = posicao >= musica["duracao"]
            if not musica["pronta"]:
                corpo["motivo"] = "a_mao"
                corpo["motivo_devolver"] = "esta música não tem tempo marcado"
            elif posicao is None:
                corpo["motivo_devolver"] = "a música não está tocando"
                if self._letra == "sozinho":
                    corpo["motivo"] = "sem_tempo" if self._andou else "esperando"
                else:
                    corpo["motivo"] = "assumido"
            else:
                corpo["pode_devolver"] = self._letra == "na_mao"
                if self._letra == "na_mao":
                    corpo["motivo"] = "assumido"
                elif not self._segurando and self._slide is not None and self._slide + 1 < len(slides):
                    proximo = slides[self._slide + 1]["tempo"]
                    if proximo is not None:
                        corpo["proximo_em"] = round(max(0.0, proximo - posicao), 1)
            return corpo

    # -- acoes ---------------------------------------------------------------
    #
    # Todas devolvem (corpo, codigo_http). `titulo` vai para o historico.

    def _sem_musica(self):
        return {"erro": "nenhuma música foi escolhida ainda"}, 409

    @staticmethod
    def _nome(quem):
        return str(quem or "").strip()[:40] or "Alguém"

    def _feito(self, titulo, erro=None):
        if erro:
            return {"ok": False, "titulo": titulo, "detalhe": "a letra não chegou ao telão: " + erro}, 200
        return {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}, 200

    def assumir(self, quem):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            self._letra, self._segurando = "na_mao", False
            self._quem = self._nome(quem)
            if self._slide is None and musica["slides"]:
                self._trocar_slide(0)
            return self._feito(self._quem + " assumiu a letra")

    def devolver(self, quem):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if not musica["pronta"]:
                return {"erro": "esta música não tem tempo marcado"}, 409
            posicao, _ = self._posicao(musica)
            if posicao is None:
                return {"erro": "a música não está tocando"}, 409
            self._letra, self._segurando = "sozinho", False
            self._quem = self._nome(quem)
            self._andou = True
            self._luz_presa = None
            self._parte_da_luz = None
            alvo = self._slide_em(musica, posicao)
            mudou = alvo != self._slide
            self._trocar_slide(alvo)
        erro = self._mandar_slide(musica, alvo) if mudou else None
        return self._feito(self._nome(quem) + " devolveu a letra", erro)

    def segurar(self, sim, quem):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if self._letra != "sozinho":
                return {"erro": "a letra já está na mão"}, 409
            self._segurando = bool(sim)
            self._quem = self._nome(quem)
            return self._feito(self._quem + (" segurou a letra" if sim else " soltou a letra"))

    def ir_slide(self, para, visto, quem):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            total = len(musica["slides"])
            if not total:
                return {"erro": "esta música não tem slides"}, 409
            atual = self._slide if self._slide is not None else 0
            if visto is not None:
                try:
                    visto = int(visto)
                except (TypeError, ValueError):
                    visto = None
            if visto is not None and visto != atual:
                # Outro aparelho tocou no mesmo instante: nao anda duas vezes.
                return {"erro": "outra pessoa acabou de passar o slide", "conflito": True}, 409
            if para == "proximo":
                alvo = atual + 1
            elif para == "anterior":
                alvo = atual - 1
            else:
                try:
                    alvo = int(para)
                except (TypeError, ValueError):
                    return {"erro": "slide desconhecido"}, 400
            if alvo >= total:
                return {"erro": "este é o último slide"}, 409
            if alvo < 0:
                return {"erro": "este é o primeiro slide"}, 409
            self._letra, self._segurando = "na_mao", False
            self._quem = self._nome(quem)
            self._trocar_slide(alvo)
        erro = self._mandar_na_mao(musica, alvo)
        return self._feito("Letra: slide {} de {}".format(alvo + 1, total), erro)

    def _ir_parte(self, musica, indice, quem):
        """Chamar sob a tranca. Devolve (slide, aplica_luz)."""
        parte = musica["partes"][indice]
        self._letra, self._segurando = "na_mao", False
        self._quem = self._nome(quem)
        self._trocar_slide(parte["primeiro_slide"])
        # A luz acompanha o atalho, a nao ser que alguem a tenha posto na mao
        # numa musica que tem tempo. Em musica "a mao" o atalho e o unico
        # jeito de a luz seguir a parte.
        aplica = self._luz == "seguindo" or not musica["pronta"]
        if aplica:
            self._luz_presa = indice
            self._parte_da_luz = indice
        return parte["primeiro_slide"], aplica

    def ir_parte(self, indice, quem):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            try:
                indice = int(indice)
            except (TypeError, ValueError):
                return {"erro": "parte desconhecida"}, 400
            if not 0 <= indice < len(musica["partes"]):
                return {"erro": "parte desconhecida"}, 400
            slide, aplica = self._ir_parte(musica, indice, quem)
            nome = musica["partes"][indice]["nome"]
        if aplica:
            self._mandar_luz(musica, indice)
        return self._feito("Letra: " + nome, self._mandar_na_mao(musica, slide))

    def repetir_refrao(self, quem):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            refroes = [i for i, p in enumerate(musica["partes"]) if p["tipo"] == "refrao"]
            if not refroes:
                return {"erro": "esta música não tem refrão marcado"}, 409
            posicao, _ = self._posicao(musica)
            if self._letra == "sozinho" and posicao is not None:
                onde = self._parte_em(musica, posicao)
            elif self._slide is not None and self._slide < len(musica["slides"]):
                onde = musica["slides"][self._slide]["parte"]
            else:
                onde = 0
            passados = [i for i in refroes if i <= onde]
            if not passados:
                return {"erro": "o refrão ainda não chegou"}, 409
            indice = passados[-1]
            slide, aplica = self._ir_parte(musica, indice, quem)
        if aplica:
            self._mandar_luz(musica, indice)
        return self._feito(self._nome(quem) + " voltou ao refrão", self._mandar_na_mao(musica, slide))

    def seguir_de(self, para, quem):
        """A musica esta no slide `para`: o tempo vai para o inicio dele e a
        letra segue sozinha dali. E o caso da musica que comecou sem ninguem
        tocar "Comecou", ou do operador que passou a mao e quer soltar.

        So com o tempo contado aqui (cronometro): com o Reaper ou o audio do
        navegador, quem diz onde a musica esta e o audio."""
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if not musica["pronta"]:
                return {"erro": "esta música não tem tempo marcado"}, 409
            try:
                alvo = int(para)
            except (TypeError, ValueError):
                return {"erro": "slide desconhecido"}, 400
            if not 0 <= alvo < len(musica["slides"]):
                return {"erro": "esse slide não existe"}, 400
            tempo = musica["slides"][alvo]["tempo"]
            if tempo is None:
                return {"erro": "esse slide não tem tempo marcado"}, 409
            if not self._relogio.posicionar(musica["id"], tempo):
                return {"erro": "aqui o tempo vem do áudio da música: a letra acompanha ele sozinha"}, 409
            self._letra, self._segurando = "sozinho", False
            self._quem = self._nome(quem)
            self._andou = True
            self._avisou_sem_sinal = False
            self._trocar_slide(alvo)
        erro = self._mandar_na_mao(musica, alvo)
        return self._feito("{}: letra sozinha a partir do slide {}".format(self._nome(quem), alvo + 1), erro)

    def tirar(self, quem):
        """Tira a letra do telao. O louvor continua: o tempo conta, o slide
        e acompanhado, e "Voltar ao telao" (ou passar um slide) traz de volta."""
        if self._tirar is None:
            return {"erro": "o telão está desligado neste PC"}, 400
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if self._fora:
                return {"erro": "a letra já está fora do telão"}, 409
            self._fora = True
            self._quem = self._nome(quem)
            self._retentar_em = None
        try:
            self._tirar()
        except Exception as falha:
            return {"ok": False, "titulo": "Tirar a letra do telão", "detalhe": str(falha)[:160]}, 200
        return self._feito(self._nome(quem) + " tirou a letra do telão")

    def voltar(self, quem):
        """Poe a letra de volta no slide em que a musica esta."""
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if not self._fora:
                return {"erro": "a letra já está no telão"}, 409
            posicao, _ = self._posicao(musica)
            if self._letra == "sozinho" and not self._segurando and posicao is not None:
                self._trocar_slide(self._slide_em(musica, posicao))
            alvo = self._slide if self._slide is not None else 0
            self._quem = self._nome(quem)
        return self._feito(self._nome(quem) + " voltou a letra ao telão", self._mandar_na_mao(musica, alvo))

    def ir_musica(self, para):
        with self._tranca:
            lista = self._lista()
            indice, _ = self._atual(lista)
            if not lista:
                return {"erro": "não há músicas para hoje"}, 409
            if para == "proxima":
                alvo = 0 if indice is None else indice + 1
                if alvo >= len(lista):
                    return {"erro": "esta é a última música"}, 409
            else:
                achados = [i for i, m in enumerate(lista) if m["id"] == str(para)]
                if not achados:
                    return {"erro": "essa música não está na lista de hoje"}, 404
                alvo = achados[0]
            musica = lista[alvo]
            self._id = musica["id"]
            self._letra = "sozinho" if musica["pronta"] else "na_mao"
            self._luz = "seguindo" if musica["pronta"] else "na_mao"
            self._segurando = False
            self._quem = None
            self._andou = False
            self._avisou_sem_sinal = False
            self._parte_da_luz = None
            self._luz_presa = None
            self._erro_letra = None
            self._fora = False
            self._trocar_slide(0 if musica["slides"] else None)
        self._relogio.parar()
        if self._guardar:
            try:
                self._guardar(musica["id"])
            except Exception:
                pass
        erro = None
        try:
            self._mostrar_musica(musica)
        except Exception as falha:
            erro = str(falha)[:160]
            with self._tranca:
                self._erro_letra = erro
        if erro is None and musica["slides"]:
            erro = self._mandar_slide(musica, 0)
        return self._feito("Música: " + musica["titulo"], erro)

    def encerrar(self):
        """Sai do louvor: nenhuma musica escolhida."""
        with self._tranca:
            self._id = None
            self._slide = None
            self._letra, self._luz, self._segurando = "na_mao", "na_mao", False
            self._fora = False
        self._relogio.parar()
        if self._guardar:
            try:
                self._guardar(None)
            except Exception:
                pass

    def seguir_luz(self):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if not musica["pronta"]:
                return {"erro": "esta música não tem tempo marcado"}, 409
            self._luz = "seguindo"
            self._luz_presa = None
            self._parte_da_luz = None
            return self._feito("Luz seguindo a música")

    def luz_na_mao(self):
        """Alguem mexeu na luz durante a musica: o condutor para de troca-la."""
        with self._tranca:
            if self._id is not None:
                self._luz = "na_mao"
                self._luz_presa = None

    def comecou(self):
        with self._tranca:
            _, musica = self._atual()
            if musica is None:
                return self._sem_musica()
            if not musica["pronta"]:
                return {"erro": "esta música não tem tempo marcado"}, 409
        if not self._relogio.comecar(musica["id"]):
            return {"erro": "nesta igreja o tempo da música não é contado à mão"}, 409
        return self._feito(musica["titulo"] + ": começou")

    def acertar(self, segundos):
        try:
            segundos = max(-ACERTO_MAXIMO, min(ACERTO_MAXIMO, float(segundos)))
        except (TypeError, ValueError):
            return {"erro": "acerto desconhecido"}, 400
        if not self._relogio.acertar(segundos):
            return {"erro": "o tempo da música não está sendo contado à mão"}, 409
        return self._feito("Tempo da música acertado em {:+.1f} s".format(segundos))
