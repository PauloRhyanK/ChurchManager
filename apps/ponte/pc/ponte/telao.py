"""O que esta no telao AGORA, slide a slide, e como passar.

Le a apresentacao atual do Holyrics (GetCurrentPresentation, com a lista de
slides) e manda avancar, voltar ou ir direto a um slide (ActionNext,
ActionPrevious, ActionGoToIndex). Serve para QUALQUER coisa que esteja no
telao: uma musica aberta a mao, um texto, um aviso. Nao depende do louvor nem
da palavra da Ponte.

Conferido na documentacao do API Server do Holyrics (github.com/holyrics/
API-Server) em 20/11/2026: as tres acoes existem desde a 2.19.0; a lista de
slides (`include_slides`) desde a 2.21.0 e nao vem para versiculo;
`slide_number` comeca em 1 e o `index` do ActionGoToIndex comeca em zero.
NAO FOI TESTADO NA INSTALACAO DA IGREJA, e cada acao precisa de permissao no
token.

A lista de slides so e pedida quando a apresentacao MUDA: perguntar "em que
slide estamos" uma vez por segundo e barato; trazer a letra inteira toda vez
nao seria.
"""

import hashlib
import re
import threading
import time

from .repertorio import _texto_do_slide

PAUSA = 1.0
# A miniatura de cada slide, pedida ao Holyrics junto com a lista. Sem ela,
# uma apresentacao de IMAGENS (a pasta Pregacao, por exemplo) aparecia no
# painel pelo NOME do arquivo (19/11/2026). 320x180 basta para a tela e
# mantem o conteudo leve para ir a versao web.
PREVIA = "320x180"
PREVIA_MAXIMA = 300 * 1024          # caracteres de base64 por slide
NOME_DE_ARQUIVO = re.compile(r"^[^\n]{1,200}\.(jpe?g|png|gif|bmp|webp|tiff?)$", re.I)


class Telao:
    def __init__(self, cliente, agora=time.monotonic):
        self._cliente = cliente      # funcao que devolve o cliente do Holyrics, ou None
        self._agora = agora
        self._tranca = threading.Lock()
        self._atual = None           # {"id", "tipo", "nome", "slide", "total"} ou None
        self._chave = None           # o que identifica a apresentacao
        self._slides = []
        self._lido_em = None
        self._responde = False
        self._erro = None

    # -- leitura -------------------------------------------------------------

    @staticmethod
    def _dados(corpo):
        return corpo.get("data") if isinstance(corpo, dict) and "data" in corpo else corpo

    def ler(self):
        """Uma olhada no Holyrics. Nunca levanta excecao."""
        cliente = self._cliente()
        if cliente is None:
            with self._tranca:
                self._responde, self._atual, self._slides, self._chave = False, None, [], None
            return
        try:
            dados = self._dados(cliente.pedir("GetCurrentPresentation"))
        except Exception:
            with self._tranca:
                self._responde = False
            return
        if not isinstance(dados, dict) or not dados:
            with self._tranca:
                self._responde, self._atual, self._slides, self._chave = True, None, [], None
                self._lido_em = self._agora()
            return
        try:
            numero = int(dados.get("slide_number")) if dados.get("slide_number") is not None else None
        except (TypeError, ValueError):
            numero = None
        try:
            total = int(dados.get("total_slides")) if dados.get("total_slides") is not None else None
        except (TypeError, ValueError):
            total = None
        atual = {"id": str(dados.get("id") or ""), "tipo": str(dados.get("type") or ""),
                 "nome": str(dados.get("name") or ""),
                 "slide": numero - 1 if numero and numero > 0 else None, "total": total}
        chave = (atual["id"], atual["tipo"], atual["nome"], total)
        slides = None
        if chave != self._chave:
            slides = []
            try:
                try:
                    com_slides = self._dados(cliente.pedir("GetCurrentPresentation", {
                        "include_slides": True, "include_slide_preview": True,
                        "slide_preview_size": PREVIA}))
                except Exception:
                    # Holyrics antigo, ou sem permissao para a previa: vai sem.
                    com_slides = self._dados(cliente.pedir("GetCurrentPresentation", {"include_slides": True}))
                for item in (com_slides or {}).get("slides") or []:
                    if not isinstance(item, dict):
                        continue
                    linhas, instrucoes = _texto_do_slide(item)
                    # Slide de imagem: o "texto" e o nome do arquivo. Nao serve
                    # para ninguem no painel; a miniatura e que mostra.
                    if len(linhas) == 1 and NOME_DE_ARQUIVO.match(linhas[0]):
                        linhas = []
                    previa = item.get("preview")
                    slide = {"indice": len(slides), "linhas": linhas, "instrucoes": instrucoes,
                             "descricao": str(item.get("slide_description") or "")}
                    if isinstance(previa, str) and 0 < len(previa) <= PREVIA_MAXIMA:
                        slide["imagem"] = previa
                    slides.append(slide)
            except Exception:
                # Versiculo nao tem lista, e um Holyrics antigo nao conhece o
                # parametro: a tela mostra "slide 3 de 12" e os botoes seguem.
                slides = []
        with self._tranca:
            self._responde, self._atual, self._lido_em = True, atual, self._agora()
            if slides is not None:
                self._chave, self._slides = chave, slides

    def comecar(self):
        def laco():
            while True:
                self.ler()
                time.sleep(PAUSA)
        threading.Thread(target=laco, daemon=True).start()

    def retrato(self):
        with self._tranca:
            if not self._responde:
                return {"responde": False, "vazio": True, "erro": self._erro}
            if self._atual is None:
                return {"responde": True, "vazio": True, "erro": self._erro}
            corpo = dict(self._atual)
            corpo.update({"responde": True, "vazio": False, "erro": self._erro,
                          "tem_lista": bool(self._slides), "versao": self.versao_sem_tranca()})
            return corpo

    def versao_sem_tranca(self):
        if self._chave is None:
            return None
        return hashlib.sha1(repr((self._chave, len(self._slides))).encode("utf-8")).hexdigest()[:10]

    def versao(self):
        with self._tranca:
            return self.versao_sem_tranca()

    def slides(self):
        with self._tranca:
            return list(self._slides)

    # -- passar --------------------------------------------------------------

    def tirar(self):
        """Fecha o que esta aberto no Holyrics: o telao fica vazio."""
        cliente = self._cliente()
        if cliente is None:
            return {"erro": "o telão está desligado neste PC"}, 400
        with self._tranca:
            atual = self._atual
        if atual is None:
            return {"erro": "não há nada no telão para tirar"}, 409
        try:
            cliente.pedir("CloseCurrentPresentation")
        except Exception as erro:
            return {"ok": False, "titulo": "Tirar do telão", "detalhe": str(erro)[:160]}, 200
        self.ler()
        return {"ok": True, "titulo": (atual.get("nome") or "Apresentação") + " fora do telão",
                "detalhe": "tudo certo"}, 200

    def ir(self, para, visto=None):
        """(corpo, codigo). `visto` e o slide que a tela mostrava: se o telao
        ja saiu dele (outra pessoa tocou), o toque nao vale."""
        cliente = self._cliente()
        if cliente is None:
            return {"erro": "o telão está desligado neste PC"}, 400
        with self._tranca:
            atual = self._atual
        if atual is None:
            return {"erro": "não há nada no telão para passar"}, 409
        if visto is not None:
            try:
                visto = int(visto)
            except (TypeError, ValueError):
                visto = None
        if visto is not None and atual["slide"] is not None and visto != atual["slide"]:
            return {"erro": "outra pessoa acabou de passar o slide", "conflito": True}, 409
        try:
            if para == "proximo":
                cliente.pedir("ActionNext")
            elif para == "anterior":
                cliente.pedir("ActionPrevious")
            else:
                try:
                    indice = int(para)
                except (TypeError, ValueError):
                    return {"erro": "slide desconhecido"}, 400
                if indice < 0 or (atual["total"] and indice >= atual["total"]):
                    return {"erro": "esse slide não existe"}, 400
                cliente.pedir("ActionGoToIndex", {"index": indice})
        except Exception as erro:
            with self._tranca:
                self._erro = str(erro)[:160]
            return {"ok": False, "titulo": "Passar o slide", "detalhe": str(erro)[:160]}, 200
        with self._tranca:
            self._erro = None
        self.ler()      # a tela ve o slide novo na proxima leitura, nao 1 s depois
        return {"ok": True, "titulo": "Slide passado", "detalhe": "tudo certo"}, 200
