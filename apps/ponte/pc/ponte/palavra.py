"""A palavra no culto: os slides do sermao, quem os passa, e o link do pregador.

DE ONDE VEM. O formato e o que o modulo Palavras do ChurchManager propos para
a Ponte (nota de 19/11/2026):

    {"title", "preacherName", "style", "updatedAt",
     "slides": [{"index", "kind": "TITLE"|"VERSE"|"POINT"|"SUMMARY",
                 "text", "reference"}]}

Sem tempo por slide: a palavra anda a mao. Hoje quem entrega e um arquivo
local (FontePalavraLocal); quando a rota do ChurchManager existir, entra outra
fonte com o mesmo metodo `palavra()`, e nada do resto muda.

QUEM PASSA. O pregador, pelo celular, e o operador, pelo painel. Vale o ultimo
toque, e o estado sempre diz de quem foi. Nao ha trava: "Assumir" so marca
quem esta passando.

O LINK DO PREGADOR vale so naquele culto: um codigo sorteado, guardado na
memoria, que morre em 6 horas, quando o operador encerra, ou quando outro e
gerado. A versao web nunca recebe o codigo por iniciativa da igreja: recebe so
o resumo (SHA-256) dele, para saber se o que o celular apresentou confere.
"""

import hashlib
import hmac
import json
import os
import secrets
import threading
import time

ROTULOS = {"TITLE": "Título", "VERSE": "Versículo", "POINT": "Ponto", "SUMMARY": "Resumo"}
VALIDADE_DO_LINK = 6 * 3600
PREGADOR = "O pregador"


def normalizar(bruto):
    """O sermao do contrato -> o que a ponte usa. None se nao ha palavra."""
    if isinstance(bruto, dict) and isinstance(bruto.get("sermon"), dict):
        bruto = bruto["sermon"]
    if not isinstance(bruto, dict):
        return None
    slides = []
    for item in bruto.get("slides") or []:
        if not isinstance(item, dict):
            continue
        tipo = str(item.get("kind") or "POINT").upper()
        if tipo not in ROTULOS:
            tipo = "POINT"
        texto = str(item.get("text") or "").strip()[:600]
        referencia = str(item.get("reference") or "").strip()[:80] or None
        if not texto and not referencia:
            continue
        slides.append({"indice": len(slides), "tipo": tipo, "rotulo": ROTULOS[tipo],
                       "texto": texto, "referencia": referencia})
    titulo = str(bruto.get("title") or "").strip()[:200]
    if not titulo and not slides:
        return None
    try:
        minutos = int(bruto.get("estimatedMinutes")) if bruto.get("estimatedMinutes") else None
    except (TypeError, ValueError):
        minutos = None
    palavra = {"titulo": titulo or "Palavra", "pregador": str(bruto.get("preacherName") or "").strip()[:120],
               "minutos": minutos, "slides": slides}
    palavra["versao"] = hashlib.sha1(
        json.dumps(palavra, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:12]
    return palavra


class FontePalavraLocal:
    """A palavra de hoje num arquivo desta pasta (_palavra_do_dia.json)."""

    def __init__(self, caminho):
        self._caminho = caminho
        self._lido = None
        self._palavra = None

    def palavra(self):
        try:
            marca = os.path.getmtime(self._caminho)
        except OSError:
            self._lido, self._palavra = None, None
            return None
        if marca != self._lido:
            self._lido = marca
            try:
                with open(self._caminho, "r", encoding="utf-8-sig") as arquivo:
                    self._palavra = normalizar(json.load(arquivo))
            except Exception as erro:
                print("  AVISO: nao consegui ler {}: {}".format(self._caminho, erro))
                self._palavra = None
        return self._palavra


class TelaoDaPalavra:
    """Poe um slide da palavra no telao, pelo Holyrics.

    VERSICULO VAI SO PELA REFERENCIA: quem exibe e o Holyrics, com a Biblia,
    a versao e o tema que a igreja ja usa. A ponte nao escreve o texto do
    versiculo no telao.

    Os nomes das acoes mudam entre versoes do Holyrics e cada uma precisa de
    permissao no token. Por isso sao configuraveis (bloco `palavra` do
    config.yaml) e ha um conferidor (verificar_palavra.py). ESTES NOMES NAO
    FORAM TESTADOS NA INSTALACAO DA IGREJA.
    """

    PADRAO = {
        "versiculo": {"acao": "ShowVerse", "campo": "references"},
        "texto": {"acao": "ShowQuickPresentation", "campo": "text"},
        "tirar": {"acao": "CloseCurrentPresentation"},
    }

    def __init__(self, cliente, config=None):
        self._cliente = cliente      # funcao que devolve o cliente do Holyrics, ou None
        self._config = config or (lambda: {})
        self._no_ar = None           # referencia do versiculo que esta no telao

    def _conf(self, qual):
        escrito = (self._config() or {}).get("palavra") or {}
        dados = dict(self.PADRAO[qual])
        if isinstance(escrito.get(qual), dict):
            dados.update(escrito[qual])
        return dados

    def mostrar(self, slide):
        cliente = self._cliente()
        if cliente is None:
            raise RuntimeError("o telão está desligado neste PC")
        if slide["tipo"] == "VERSE" and slide.get("referencia"):
            # Um versiculo comprido vem do ChurchManager em mais de um slide,
            # todos com a mesma referencia. O Holyrics mostra o versiculo
            # inteiro: repetir o pedido so faria o telao piscar.
            if self._no_ar == slide["referencia"]:
                return
            conf = self._conf("versiculo")
            cliente.pedir(conf["acao"], {conf.get("campo") or "references": slide["referencia"]})
            self._no_ar = slide["referencia"]
            return
        conf = self._conf("texto")
        texto = slide["texto"] or slide.get("referencia") or ""
        cliente.pedir(conf["acao"], {conf.get("campo") or "text": texto})
        self._no_ar = None

    def tirar(self):
        self._no_ar = None
        cliente = self._cliente()
        if cliente is None:
            raise RuntimeError("o telão está desligado neste PC")
        cliente.pedir(self._conf("tirar")["acao"])


class Palavra:
    def __init__(self, fonte, mostrar, tirar, anotar, agora=time.time, validade=VALIDADE_DO_LINK):
        self._fonte = fonte
        self._mostrar = mostrar
        self._tirar = tirar
        self._anotar = anotar
        self._agora = agora
        self._validade = validade
        self._tranca = threading.RLock()
        self._versao = None
        self._slide = None        # None = nada da palavra foi ao telao ainda
        self._visivel = False
        self._quem = None
        self._erro = None
        self._codigo = None
        self._expira = None

    # -- leitura -------------------------------------------------------------

    def _palavra(self):
        try:
            palavra = self._fonte()
        except Exception:
            palavra = None
        with self._tranca:
            versao = palavra["versao"] if palavra else None
            if versao != self._versao:
                # A palavra mudou (o pregador mexeu nos slides): o lugar so
                # vale se ainda existe.
                self._versao = versao
                total = len(palavra["slides"]) if palavra else 0
                if self._slide is not None and self._slide >= total:
                    self._slide, self._visivel = (total - 1 if total else None), False
        return palavra

    def conteudo(self):
        palavra = self._palavra()
        if palavra is None:
            return None
        return {"versao": palavra["versao"], "slides": palavra["slides"]}

    def retrato(self):
        palavra = self._palavra()
        with self._tranca:
            link = None
            if self._link_vale():
                link = {"expira_em": self._expira,
                        "resumo": hashlib.sha256(self._codigo.encode("utf-8")).hexdigest()}
            if palavra is None:
                return {"ativa": False, "link": link}
            return {
                "ativa": True, "titulo": palavra["titulo"], "pregador": palavra["pregador"],
                "minutos": palavra["minutos"], "versao": palavra["versao"],
                "slide": self._slide, "total": len(palavra["slides"]), "visivel": self._visivel,
                "quem": self._quem, "quem_e_o_pregador": self._quem == PREGADOR,
                "erro": self._erro, "link": link,
            }

    # -- acoes ---------------------------------------------------------------

    @staticmethod
    def _nome(quem):
        return str(quem or "").strip()[:40] or "Alguém"

    def ir(self, para, visto, quem):
        palavra = self._palavra()
        if palavra is None or not palavra["slides"]:
            return {"erro": "não há slides da palavra para hoje"}, 409
        total = len(palavra["slides"])
        with self._tranca:
            atual = -1 if self._slide is None else self._slide
            if visto is not None:
                try:
                    visto = int(visto)
                except (TypeError, ValueError):
                    visto = None
            if visto is not None and visto != atual:
                return {"erro": "outra pessoa acabou de passar o slide", "conflito": True}, 409
            if para == "proximo":
                # Com o slide escondido, "Proximo" traz de volta o mesmo.
                alvo = atual + 1 if (self._visivel or atual < 0) else atual
            elif para == "anterior":
                alvo = atual - 1 if (self._visivel or atual < 0) else atual
            else:
                try:
                    alvo = int(para)
                except (TypeError, ValueError):
                    return {"erro": "slide desconhecido"}, 400
            if alvo >= total:
                return {"erro": "este é o último slide"}, 409
            if alvo < 0:
                return {"erro": "este é o primeiro slide"}, 409
            self._slide, self._visivel = alvo, True
            self._quem = self._nome(quem)
        slide = palavra["slides"][alvo]
        try:
            self._mostrar(slide)
            erro = None
        except Exception as falha:
            erro = str(falha)[:160] or "o slide não chegou ao telão"
        with self._tranca:
            if self._slide == alvo:
                self._erro = erro
        titulo = "Palavra: slide {} de {}".format(alvo + 1, total)
        if erro:
            # A lista segue mesmo assim: o operador abre a mao no Holyrics.
            return {"ok": False, "titulo": titulo, "detalhe": "abra no Holyrics: " + (
                slide.get("referencia") or slide["texto"][:60]) + " (" + erro + ")"}, 200
        return {"ok": True, "titulo": titulo, "detalhe": "tudo certo"}, 200

    def tirar(self, quem):
        with self._tranca:
            if self._slide is None:
                return {"erro": "não há nada da palavra no telão"}, 409
            self._visivel = False
            self._quem = self._nome(quem)
            self._erro = None
        try:
            self._tirar()
        except Exception as falha:
            return {"ok": False, "titulo": "Palavra fora do telão", "detalhe": str(falha)[:160]}, 200
        return {"ok": True, "titulo": self._nome(quem) + " tirou a palavra do telão", "detalhe": "tudo certo"}, 200

    def assumir(self, quem):
        with self._tranca:
            self._quem = self._nome(quem)
            return {"ok": True, "titulo": self._quem + " assumiu os slides da palavra", "detalhe": "tudo certo"}, 200

    # -- o link do pregador ---------------------------------------------------

    def _link_vale(self):
        return self._codigo is not None and self._agora() < self._expira

    def gerar_link(self):
        """Um codigo novo. O anterior, se havia, morre aqui."""
        with self._tranca:
            self._codigo = secrets.token_urlsafe(16)
            self._expira = self._agora() + self._validade
            return self._codigo

    def encerrar_link(self):
        with self._tranca:
            self._codigo = None
            self._expira = None

    def confere(self, codigo):
        with self._tranca:
            if not self._link_vale() or not isinstance(codigo, str):
                return False
            return hmac.compare_digest(codigo.encode("utf-8"), self._codigo.encode("utf-8"))

    def codigo(self):
        """O codigo do link que esta valendo, ou None. So para o painel LOCAL
        montar o endereco: nunca vai no retrato, que viaja para a web."""
        with self._tranca:
            return self._codigo if self._link_vale() else None

    def tem_link(self):
        with self._tranca:
            return self._link_vale()
