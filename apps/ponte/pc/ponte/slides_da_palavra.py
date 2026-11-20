"""As imagens dos slides da palavra, postas na pasta de imagens do Holyrics.

O PROBLEMA (culto de 19/11/2026). O botao "Abrir os slides da Palavra" mandava
o Holyrics abrir uma pasta de imagens chamada "Pregação", e o Holyrics
respondia "file not allowed: Pregação". A pasta nao existia: ninguem punha as
imagens la, e os slides que o pregador montou no ChurchManager nunca chegavam
a este PC.

O QUE ESTE ARQUIVO FAZ. O ChurchManager manda, junto da palavra do culto, um
PNG 1920x1080 para cada slide (`imageUrl`). Quando a palavra muda, o PC
principal BAIXA esses PNGs para uma subpasta da pasta de imagens do Holyrics
e apaga os da versao anterior. Sozinho, em segundo plano.

POR QUE NO DISCO. A API do Holyrics nao tem acao para receber um arquivo: o
`ShowImage` so mostra o que ja esta na aba Imagens dele, pelo nome
("arquivo.jpg", "pasta" ou "pasta/arquivo.jpg"). Entao as imagens tem que
estar na pasta dele, e quem pode por la e este PC.

CUIDADOS:
  - so troca as imagens quando TODAS as novas chegaram inteiras. Uma internet
    que cai no meio do download nao deixa o culto com meia palavra;
  - so apaga o que a propria Ponte pos (a lista fica em
    _slides_da_palavra.json). Imagem que alguem colocou a mao na pasta fica;
  - cada versao ganha nomes novos ("01-ab12cd.png"): o Holyrics nao mostra a
    miniatura velha de um arquivo que mudou por dentro.

NUNCA RODOU COM O HOLYRICS DE VERDADE. O que nao sei: onde fica a pasta de
imagens na instalacao da igreja (o palpite e <pasta do Holyrics>\\Holyrics\\
files\\media\\image, e da para escrever no config), e se o Holyrics enxerga
na hora um arquivo novo posto na pasta por fora.
"""

import json
import os
import threading
import time

PASSO = 10.0
TENTAR_DE_NOVO = 60.0
MAIOR_IMAGEM = 15 * 1024 * 1024
ASSINATURAS = ((b"\x89PNG\r\n\x1a\n", ".png"), (b"\xff\xd8\xff", ".jpg"))


def extensao(dados):
    """'.png' ou '.jpg' pelos primeiros bytes. None se nao e imagem."""
    for assinatura, final in ASSINATURAS:
        if dados[:len(assinatura)] == assinatura:
            return final
    return None


def baixar_pela_rede(url):
    import requests
    if not str(url).lower().startswith(("https://", "http://")):
        raise RuntimeError("endereço de imagem estranho")
    resposta = requests.get(url, timeout=20)
    if resposta.status_code != 200:
        raise RuntimeError("o servidor das imagens respondeu {}".format(resposta.status_code))
    return resposta.content


def pasta_de_imagens_do_holyrics(config, cliente=None):
    """Onde, no disco, ficam as imagens do Holyrics. None se nao achei.

    Vale o que estiver em `palavra.pasta_no_disco`. Sem isso, pergunta ao
    Holyrics onde ele esta instalado (GetVersion devolve `baseDir`) e tenta o
    caminho de fabrica; por ultimo, C:\\Holyrics.
    """
    escrito = ((config or {}).get("palavra") or {}).get("pasta_no_disco")
    if escrito:
        return str(escrito) if os.path.isdir(str(escrito)) else None
    bases = []
    if cliente is not None:
        try:
            corpo = cliente.pedir("GetVersion")
            dados = corpo.get("data") if isinstance(corpo, dict) and "data" in corpo else corpo
            if isinstance(dados, dict) and dados.get("baseDir"):
                bases.append(str(dados["baseDir"]))
        except Exception:
            pass
    bases.append(r"C:\Holyrics")
    for base in bases:
        for resto in (("Holyrics", "files", "media", "image"), ("files", "media", "image")):
            caminho = os.path.join(base, *resto)
            if os.path.isdir(caminho):
                return caminho
    return None


class SlidesDaPalavra:
    def __init__(self, palavra, pasta_no_disco, subpasta="Palavra", caminho_da_lista=None,
                 baixar=baixar_pela_rede, anotar=None, agora=time.time):
        self._palavra = palavra                  # funcao: a palavra do culto (ponte/palavra.py), ou None
        self._pasta_no_disco = pasta_no_disco    # funcao: a pasta de imagens do Holyrics, ou None
        self.subpasta = str(subpasta or "Palavra").strip().strip("/\\") or "Palavra"
        self._caminho_da_lista = caminho_da_lista
        self._baixar = baixar
        self._anotar = anotar
        self._agora = agora
        self._tranca = threading.Lock()
        self._versao = None          # a versao da palavra cujas imagens estao na pasta
        self._arquivos = {}          # indice do slide -> nome do arquivo dentro da subpasta
        self._postos = []            # tudo o que a Ponte pos na pasta (para saber o que apagar)
        self._estado = "sem_palavra"
        self._motivo = ""
        self._tentou = (None, 0.0)   # (versao que falhou, quando)
        self._ler_lista()

    # -- a lista do que a Ponte pos na pasta ----------------------------------

    def _ler_lista(self):
        if not self._caminho_da_lista:
            return
        try:
            with open(self._caminho_da_lista, "r", encoding="utf-8-sig") as arquivo:
                dados = json.load(arquivo)
        except (OSError, ValueError):
            return
        if not isinstance(dados, dict):
            return
        self._versao = dados.get("versao")
        self._postos = [str(n) for n in dados.get("postos") or []]
        self._arquivos = {int(i): str(n) for i, n in (dados.get("arquivos") or {}).items()}

    def _gravar_lista(self):
        if not self._caminho_da_lista:
            return
        try:
            with open(self._caminho_da_lista, "w", encoding="utf-8") as arquivo:
                json.dump({"versao": self._versao, "postos": self._postos,
                           "arquivos": {str(i): n for i, n in self._arquivos.items()}}, arquivo)
        except OSError:
            pass

    def _nota(self, titulo, ok, detalhe=""):
        if self._anotar is not None:
            try:
                self._anotar(titulo, ok, detalhe)
            except Exception:
                pass

    # -- a volta ---------------------------------------------------------------

    def passo(self):
        try:
            palavra = self._palavra()
        except Exception:
            palavra = None
        if palavra is None:
            return self._ficar("sem_palavra", "não há palavra para o culto de hoje")
        com_imagem = [s for s in palavra["slides"] if s.get("imagem_url")]
        if not com_imagem:
            return self._ficar("sem_imagens", "a palavra veio sem imagens: os slides vão como texto")
        versao = palavra["versao"]
        destino = self._pasta_no_disco()
        with self._tranca:
            em_dia = versao == self._versao and bool(self._arquivos)
        if em_dia and destino and all(
                os.path.exists(os.path.join(destino, self.subpasta, n)) for n in self._arquivos.values()):
            return self._ficar("prontos", "")
        if not destino:
            return self._ficar("sem_pasta", "não achei a pasta de imagens do Holyrics neste PC "
                                            "(escreva o caminho em palavra.pasta_no_disco)")
        if self._tentou[0] == versao and self._agora() - self._tentou[1] < TENTAR_DE_NOVO:
            return
        self._ficar("baixando", "{} imagens".format(len(com_imagem)))
        try:
            self._trazer(palavra, com_imagem, versao, os.path.join(destino, self.subpasta))
        except Exception as erro:
            self._tentou = (versao, self._agora())
            motivo = str(erro)[:160] or "não consegui baixar as imagens"
            if self._estado != "erro" or self._motivo != motivo:
                self._nota("Os slides da Palavra não chegaram", False, motivo)
            return self._ficar("erro", motivo)
        self._nota("Slides da Palavra prontos ({})".format(len(com_imagem)), True, "na pasta " + self.subpasta)
        return self._ficar("prontos", "")

    def _trazer(self, palavra, com_imagem, versao, pasta):
        # 1. Baixa TUDO para a memoria e confere. Se uma falhar, nada muda.
        novos = []
        for slide in com_imagem:
            dados = self._baixar(slide["imagem_url"])
            final = extensao(dados or b"")
            if final is None:
                raise RuntimeError("o slide {} não veio como imagem".format(slide["indice"] + 1))
            if len(dados) > MAIOR_IMAGEM:
                raise RuntimeError("a imagem do slide {} é grande demais".format(slide["indice"] + 1))
            novos.append((slide["indice"], "{:02d}-{}{}".format(slide["indice"] + 1, versao[:6], final), dados))
        # 2. Grava as novas (com nome provisorio, depois o definitivo).
        os.makedirs(pasta, exist_ok=True)
        for _, nome, dados in novos:
            provisorio = os.path.join(pasta, nome + ".baixando")
            with open(provisorio, "wb") as arquivo:
                arquivo.write(dados)
            os.replace(provisorio, os.path.join(pasta, nome))
        # 3. So agora apaga as da versao anterior, e so as que a Ponte pos.
        nomes = {nome for _, nome, _ in novos}
        with self._tranca:
            velhos = [n for n in self._postos if n not in nomes]
            self._versao = versao
            self._arquivos = {indice: nome for indice, nome, _ in novos}
            self._postos = sorted(nomes)
            self._gravar_lista()
        for nome in velhos:
            if os.sep in nome or "/" in nome or nome.startswith("."):
                continue
            try:
                os.remove(os.path.join(pasta, nome))
            except OSError:
                pass

    def _ficar(self, estado, motivo):
        with self._tranca:
            self._estado, self._motivo = estado, motivo

    def comecar(self):
        def laco():
            while True:
                try:
                    self.passo()
                except Exception as erro:
                    print("  [slides] a volta falhou: {}".format(str(erro)[:160]))
                time.sleep(PASSO)
        threading.Thread(target=laco, daemon=True).start()

    # -- o que os outros leem ---------------------------------------------------

    def arquivo(self, versao, indice):
        """O nome, para o Holyrics, da imagem deste slide ("Palavra/03-ab12cd.png").
        None se as imagens desta versao da palavra nao estao prontas."""
        with self._tranca:
            if self._estado != "prontos" or versao != self._versao:
                return None
            nome = self._arquivos.get(indice)
        return "{}/{}".format(self.subpasta, nome) if nome else None

    def retrato(self):
        with self._tranca:
            quantos = len(self._arquivos) if self._estado == "prontos" else 0
            textos = {"prontos": "Slides da Palavra prontos ({})".format(quantos),
                      "baixando": "Trazendo os slides da Palavra…",
                      "sem_palavra": "Sem palavra para o culto de hoje",
                      "sem_imagens": "A palavra veio sem imagens: os slides vão como texto",
                      "sem_pasta": "Não achei a pasta de imagens do Holyrics",
                      "erro": "Os slides da Palavra não chegaram"}
            return {"estado": self._estado, "texto": textos.get(self._estado, self._estado),
                    "motivo": self._motivo, "quantos": quantos, "pasta": self.subpasta}
