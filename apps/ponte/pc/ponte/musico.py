"""O celular do musico: o que a banda ve e o que ela pode pedir.

Uma pagina aberta por link (como a do pregador) em que quem conduz o louvor
ve a musica de agora, com as partes em lista, e manda: proximo, voltar,
repetir a parte, pular para uma parte, e ir para a proxima musica.

O RELOGIO E O AUDIO. Numa musica com tempo marcado, a letra e a luz seguem o
segundo em que o audio esta. Entao "pular para a ponte" nao e trocar de slide:
e levar o AUDIO para o comeco da ponte, e a letra vai atras. E "repetir o
refrao" e, quando o refrao acabar, voltar o audio para o comeco dele: o que o
telao mostra depois muda junto. Quem leva o audio e o VS (ponte/vs.py).

QUANDO NAO HA COMO MEXER NO AUDIO (o VS desligado no config, e o tempo vindo
de quem toca), os mesmos botoes passam a LETRA a mao, parte por parte: o telao
obedece, o audio nao. A tela do musico diz qual dos dois esta valendo.

PROXIMA MUSICA SOLTA O VS. Por isso o celular pede para segurar o botao; aqui
chega so o pedido ja confirmado.

Vale o ultimo toque, e tudo fica anotado no painel do operador ("Musico:
repetiu o refrao"). Depois de cada toque ha um "Desfazer".
"""

import hashlib
import hmac
import secrets
import threading
import time

VALIDADE_DO_LINK = 6 * 3600
DESFAZER_POR = 15.0        # segundos em que o "Desfazer" fica na tela
FOLGA_DO_FIM = 0.08        # quao perto do fim da parte o audio volta para repetir
QUEM = "Músico"
DIAS = ("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")


def _artigo(nome):
    """'Refrão' -> 'o refrão'; 'Ponte' -> 'a ponte'."""
    baixo = str(nome or "parte").strip().lower()
    return ("a " if baixo.startswith(("ponte", "intro", "estrofe")) else "o ") + baixo


class Link:
    """Um codigo que vale so neste culto. A versao web recebe apenas o resumo."""

    def __init__(self, agora=time.time, validade=VALIDADE_DO_LINK):
        self._agora = agora
        self._validade = validade
        self._tranca = threading.Lock()
        self._codigo = None
        self._expira = None

    def _vale(self):
        return self._codigo is not None and self._agora() < self._expira

    def gerar(self):
        with self._tranca:
            self._codigo = secrets.token_urlsafe(16)
            self._expira = self._agora() + self._validade
            return self._codigo

    def encerrar(self):
        with self._tranca:
            self._codigo = self._expira = None

    def confere(self, codigo):
        with self._tranca:
            if not self._vale() or not isinstance(codigo, str):
                return False
            return hmac.compare_digest(codigo.encode("utf-8"), self._codigo.encode("utf-8"))

    def codigo(self):
        with self._tranca:
            return self._codigo if self._vale() else None

    def retrato(self):
        with self._tranca:
            if not self._vale():
                return None
            return {"expira_em": self._expira, "resumo": hashlib.sha256(self._codigo.encode("utf-8")).hexdigest()}


class Musico:
    def __init__(self, condutor, roteiro, transporte, relogio, musicas, entrar, anotar,
                 sincronizar=None, no_ar=None, agora=time.time):
        self._condutor = condutor
        self._roteiro = roteiro
        self._vs = transporte
        self._relogio = relogio
        self._musicas = musicas          # funcao: a lista de musicas do dia
        self._entrar = entrar            # funcao (indice, quem, soltar_vs): executa a entrada num item
        self._anotar = anotar
        self._sincronizar = sincronizar or (lambda: None)
        self._no_ar = no_ar or (lambda: False)
        self._agora = agora
        self._tranca = threading.RLock()
        self.link = Link(agora)
        self._versao = 0
        self._repetir = 0                # quantas vezes a parte atual ainda vai repetir
        self._repetir_em = None          # (id da musica, indice da parte)
        self._feito = None               # {"texto", "em", "antes"}: o que da para desfazer

    # -- onde a musica esta --------------------------------------------------

    def _musica(self):
        retrato = self._condutor.retrato()
        if not retrato.get("musica"):
            return None, retrato
        for musica in self._musicas() or []:
            if musica["id"] == retrato["musica"]["id"]:
                return musica, retrato
        return None, retrato

    def _posicao(self, musica):
        leitura = self._relogio.ler()
        if not leitura["sinal"] or leitura["posicao"] is None or leitura["musica"] not in (None, musica["id"]):
            return None
        return leitura["posicao"]

    def _pelo_audio(self, musica):
        """Os botoes mexem no AUDIO (verdade) ou so na letra (falso)?"""
        return bool(musica["pronta"] and self._vs.pode_posicionar() and self._posicao(musica) is not None)

    def _parte(self, musica, retrato):
        posicao = self._posicao(musica)
        if musica["pronta"] and posicao is not None and retrato.get("letra") == "sozinho":
            atual = 0
            for indice, parte in enumerate(musica["partes"]):
                if parte["tempo"] is not None and parte["tempo"] <= posicao:
                    atual = indice
            return atual
        return retrato.get("parte") or 0

    @staticmethod
    def _fim(musica, indice):
        if indice + 1 < len(musica["partes"]) and musica["partes"][indice + 1]["tempo"] is not None:
            return musica["partes"][indice + 1]["tempo"]
        return musica.get("duracao")

    def _pendente(self, musica, parte):
        return self._repetir if self._repetir_em == (musica["id"], parte) else 0

    # -- a tela --------------------------------------------------------------

    def tela(self):
        self._sincronizar()
        with self._tranca:
            agora = self._agora()
            dia = time.localtime(agora)
            musica, retrato = self._musica()
            item = self._roteiro.item()
            indice = self._roteiro.atual()
            itens = self._roteiro.itens()
            tela = {"agora": agora, "versao": self._versao, "no_ar": bool(self._no_ar()),
                    "data": "{}, {:02d}/{:02d}".format(DIAS[dia.tm_wday], dia.tm_mday, dia.tm_mon),
                    "modo": "vazio", "musica": None, "partes": [], "letra": [], "pelo_audio": False,
                    "momento": None, "preparem": None, "depois": [], "feito": None,
                    "proximo": {"rotulo": "", "pode": False}, "voltar": {"rotulo": "", "pode": False},
                    "repetir": {"rotulo": "só em música", "pode": False}, "proxima_musica": None}
            if self._feito and agora - self._feito["em"] <= DESFAZER_POR:
                tela["feito"] = {"texto": self._feito["texto"]}
            seguinte = self._roteiro.vizinho(1)
            anterior = self._roteiro.vizinho(-1)
            proxima = self._roteiro.vizinho(1, so_musica=True)
            if proxima is not None:
                dela = itens[proxima]["musica"] or {}
                tela["proxima_musica"] = {"titulo": itens[proxima]["nome"], "tom": dela.get("tom")}

            def para_onde(alvo):
                if alvo is None:
                    return {"rotulo": "", "pode": False}
                destino = itens[alvo]
                return {"rotulo": ("Começar " if destino["tipo"] == "musica" else "") + destino["nome"], "pode": True}

            if musica is not None:
                parte = self._parte(musica, retrato)
                partes = musica["partes"]
                pendente = self._pendente(musica, parte)
                tela["modo"] = "musica"
                tela["pelo_audio"] = self._pelo_audio(musica)
                tela["musica"] = {"id": musica["id"], "titulo": musica["titulo"], "tom": musica.get("tom"),
                                  "bpm": int(musica["bpm"]) if musica.get("bpm") else None,
                                  "a_mao": not musica["pronta"]}
                slide = retrato.get("slide")
                if slide is not None and slide < len(musica["slides"]):
                    tela["letra"] = list(musica["slides"][slide]["linhas"])
                for i, p in enumerate(partes):
                    primeiro = musica["slides"][p["primeiro_slide"]] if p["primeiro_slide"] < len(musica["slides"]) else None
                    dica = ""
                    if i > parte and primeiro is not None:
                        if primeiro["linhas"]:
                            dica = primeiro["linhas"][0].capitalize()
                            dica = dica[:22].rstrip() + "…"
                        elif primeiro["instrucoes"]:
                            dica = primeiro["instrucoes"][0]["texto"].capitalize()
                    tela["partes"].append({"indice": i, "nome": p["nome"], "dica": dica,
                                           "estado": "agora" if i == parte else "ja_foi" if i < parte else "depois"})
                    if i == parte:
                        for _ in range(pendente):
                            tela["partes"].append({"indice": i, "nome": p["nome"], "dica": "mais uma vez",
                                                   "estado": "repete"})
                nome = partes[parte]["nome"] if partes else "parte"
                if pendente:
                    tela["proximo"] = {"rotulo": nome + " de novo", "pode": True}
                elif parte + 1 < len(partes):
                    tela["proximo"] = {"rotulo": partes[parte + 1]["nome"], "pode": True}
                else:
                    tela["proximo"] = para_onde(seguinte)
                    if not tela["proximo"]["pode"]:
                        tela["proximo"]["rotulo"] = "fim do roteiro"
                if parte > 0:
                    tela["voltar"] = {"rotulo": partes[parte - 1]["nome"], "pode": True}
                else:
                    tela["voltar"] = para_onde(anterior)
                    tela["voltar"]["rotulo"] = tela["voltar"]["rotulo"].replace("Começar ", "")
                tela["repetir"] = {"rotulo": "mais uma vez" if pendente else _artigo(nome), "pode": bool(partes)}
                return tela

            if item is None:
                tela["proximo"] = para_onde(0 if itens else None)
                return tela
            tela["modo"] = "momento"
            entrada = self._roteiro.entrada()
            tela["momento"] = {"nome": item["nome"], "de_min": item["duracao_min"],
                               "passou_s": int(round(agora - entrada)) if entrada else None}
            if proxima is not None:
                dela = itens[proxima]["musica"] or {}
                instrucao = ""
                for candidata in self._musicas() or []:
                    if candidata["id"] == dela.get("id") and candidata["slides"]:
                        recados = candidata["slides"][0]["instrucoes"]
                        instrucao = ". ".join(r["texto"][:1].upper() + r["texto"][1:] for r in recados)
                        if instrucao and not instrucao.endswith("."):
                            instrucao += "."
                        dela = dict(dela, tom=dela.get("tom") or candidata.get("tom"),
                                    bpm=dela.get("bpm") or candidata.get("bpm"))
                tela["preparem"] = {"titulo": itens[proxima]["nome"], "tom": dela.get("tom"),
                                    "bpm": int(dela["bpm"]) if dela.get("bpm") else None, "instrucao": instrucao}
            tela["depois"] = [i["nome"] for i in itens[(indice or 0) + 1:] if i["tipo"] == "momento"][:2]
            tela["proximo"] = para_onde(seguinte)
            tela["voltar"] = para_onde(anterior)
            tela["voltar"]["rotulo"] = tela["voltar"]["rotulo"].replace("Começar ", "")
            return tela

    # -- os toques -----------------------------------------------------------

    def _foto(self):
        """O que guardar para poder desfazer."""
        musica, retrato = self._musica()
        return {"item": self._roteiro.atual(), "musica": musica["id"] if musica else None,
                "posicao": self._posicao(musica) if musica else None, "slide": retrato.get("slide"),
                "parte": self._parte(musica, retrato) if musica else None,
                "repetir": self._repetir, "repetir_em": self._repetir_em, "em": self._agora()}

    def _pronto(self, texto, nota, antes):
        self._versao += 1
        self._feito = {"texto": texto, "em": self._agora(), "antes": antes}
        self._anotar("Músico: " + nota, True, "tudo certo")
        return {"ok": True, "titulo": texto}, 200

    def _ir_parte(self, musica, indice):
        """Leva a musica para o comeco de uma parte: pelo audio, se da; senao
        pela letra."""
        self._repetir, self._repetir_em = 0, None
        parte = musica["partes"][indice]
        if self._pelo_audio(musica) and parte["tempo"] is not None:
            self._vs.ir_para(musica["id"], parte["tempo"], musica["titulo"])
        else:
            self._condutor.ir_parte(indice, QUEM)

    def _item(self, indice, soltar_vs):
        self._repetir, self._repetir_em = 0, None
        return self._entrar(indice, QUEM, soltar_vs)

    def agir(self, acao, dados=None):
        """Um toque do musico. Devolve (corpo, codigo_http)."""
        dados = dados if isinstance(dados, dict) else {}
        self._sincronizar()
        with self._tranca:
            visto = dados.get("visto")
            if visto is not None and visto != self._versao:
                return {"erro": "a tela mudou. Confira e toque de novo.", "conflito": True}, 409
            if acao == "desfazer":
                return self._desfazer()
            musica, retrato = self._musica()
            antes = self._foto()
            itens = self._roteiro.itens()
            if acao == "proxima_musica":
                alvo = self._roteiro.vizinho(1, so_musica=True)
                if alvo is None:
                    return {"erro": "não há outra música no roteiro"}, 409
                self._item(alvo, True)
                return self._pronto("Começou " + itens[alvo]["nome"], "próxima música (" + itens[alvo]["nome"] + ")", antes)
            if acao in ("proximo", "voltar"):
                passo = 1 if acao == "proximo" else -1
                if musica is not None and musica["partes"]:
                    parte = self._parte(musica, retrato)
                    if acao == "proximo" and self._pendente(musica, parte):
                        # "Refrao de novo": a repeticao que estava marcada, agora.
                        self._repetir -= 1
                        pendente = self._repetir
                        self._ir_parte(musica, parte)
                        self._repetir, self._repetir_em = pendente, (musica["id"], parte) if pendente else None
                        return self._pronto(musica["partes"][parte]["nome"] + " de novo",
                                            "repetiu " + _artigo(musica["partes"][parte]["nome"]) + " agora", antes)
                    if 0 <= parte + passo < len(musica["partes"]):
                        self._ir_parte(musica, parte + passo)
                        nome = musica["partes"][parte + passo]["nome"]
                        return self._pronto(("Foi para " if passo > 0 else "Voltou para ") + _artigo(nome),
                                            ("foi para " if passo > 0 else "voltou para ") + _artigo(nome), antes)
                alvo = self._roteiro.vizinho(passo) if self._roteiro.atual() is not None else (0 if itens and passo > 0 else None)
                if alvo is None:
                    return {"erro": "o roteiro acaba aqui" if passo > 0 else "este é o começo do roteiro"}, 409
                # Entrar numa musica pelo Proximo comeca a musica: solta o VS.
                self._item(alvo, itens[alvo]["tipo"] == "musica" and passo > 0)
                nome = itens[alvo]["nome"]
                return self._pronto(("Começou " if itens[alvo]["tipo"] == "musica" and passo > 0 else
                                     "Foi para " if passo > 0 else "Voltou para ") + nome,
                                    ("foi para " if passo > 0 else "voltou para ") + nome, antes)
            if musica is None or not musica["partes"]:
                return {"erro": "isso só funciona durante uma música"}, 409
            parte = self._parte(musica, retrato)
            if acao == "repetir":
                nome = _artigo(musica["partes"][parte]["nome"])
                if self._pelo_audio(musica) and self._fim(musica, parte) is not None:
                    # Marca: quando esta parte acabar, o audio volta ao comeco dela.
                    self._repetir = min(4, self._pendente(musica, parte) + 1)
                    self._repetir_em = (musica["id"], parte)
                    vezes = "" if self._repetir == 1 else " {} vezes".format(self._repetir)
                    return self._pronto(nome.capitalize() + " vai repetir" + vezes, "repetiu " + nome, antes)
                self._ir_parte(musica, parte)
                return self._pronto(nome.capitalize() + " voltou ao começo", "repetiu " + nome, antes)
            if acao == "pular":
                try:
                    alvo = int(dados.get("parte"))
                except (TypeError, ValueError):
                    return {"erro": "parte desconhecida"}, 400
                if not 0 <= alvo < len(musica["partes"]):
                    return {"erro": "parte desconhecida"}, 400
                self._ir_parte(musica, alvo)
                nome = _artigo(musica["partes"][alvo]["nome"])
                return self._pronto("Pulou para " + nome, "pulou para " + nome, antes)
            return {"erro": "o celular do músico não faz isso"}, 400

    def _desfazer(self):
        feito = self._feito
        if feito is None or self._agora() - feito["em"] > DESFAZER_POR:
            return {"erro": "não há mais o que desfazer"}, 409
        antes = feito["antes"]
        self._feito = None
        self._versao += 1
        passou = self._agora() - antes["em"]
        if self._roteiro.atual() != antes["item"] and antes["item"] is not None:
            self._entrar(antes["item"], QUEM, False)
        musica, _ = self._musica()
        if musica is not None and musica["id"] == antes["musica"]:
            if antes["posicao"] is not None and self._vs.pode_posicionar() and musica["pronta"]:
                # Volta para onde o audio ESTARIA se o toque nao tivesse acontecido.
                self._vs.ir_para(musica["id"], antes["posicao"] + passou, musica["titulo"])
            elif antes["parte"] is not None and antes["parte"] < len(musica["partes"]):
                self._condutor.ir_parte(antes["parte"], QUEM)
        self._repetir, self._repetir_em = antes["repetir"], antes["repetir_em"]
        self._anotar("Músico: desfez (" + feito["texto"].lower() + ")", True, "tudo certo")
        return {"ok": True, "titulo": "Desfeito"}, 200

    # -- a volta: repetir a parte quando ela acaba ---------------------------

    def passo(self):
        with self._tranca:
            if not self._repetir or self._repetir_em is None:
                return
            musica, retrato = self._musica()
            if musica is None or musica["id"] != self._repetir_em[0]:
                self._repetir, self._repetir_em = 0, None
                return
            parte = self._repetir_em[1]
            posicao = self._posicao(musica)
            fim = self._fim(musica, parte)
            inicio = musica["partes"][parte]["tempo"] if parte < len(musica["partes"]) else None
            if posicao is None or fim is None or inicio is None:
                return
            if posicao < inicio - 0.5 or posicao > fim + 1.0:
                # A musica saiu desta parte por outro caminho: a marca nao vale mais.
                self._repetir, self._repetir_em = 0, None
                self._versao += 1
                return
            if posicao >= fim - FOLGA_DO_FIM:
                self._repetir -= 1
                if not self._repetir:
                    self._repetir_em = None
                self._versao += 1
                self._vs.ir_para(musica["id"], inicio, musica["titulo"])

    def comecar(self):
        def laco():
            while True:
                try:
                    self.passo()
                except Exception as erro:
                    print("  [musico] volta falhou: {}".format(erro))
                time.sleep(0.05)
        threading.Thread(target=laco, daemon=True).start()
