"""O cofre: guarda na versao web a configuracao desta igreja.

PARA QUE SERVE. Se o PC principal morrer num domingo de manha, o que se perde
nao e o programa (esse esta no repositorio): e o config.yaml com o token do
Holyrics e a senha do OBS, as cenas de luz montadas na mesa, os passos da
chegada ajustados, a colecao de cenas do OBS. Com isso guardado na web, o
instalador monta outro PC, ja configurado, em minutos.

COMO. A maquina principal confere a cada minuto se algum desses arquivos
mudou e, se mudou, entrega todos de novo. E uma conexao DE SAIDA, como o
espelho: a web nunca chama a igreja.

O QUE VAI:
    config.yaml, chegada.yaml, looks_salvas.yaml, patch.yaml
    tudo que estiver na pasta obs/ (a exportacao do OBS: colecao de cenas e
    perfil, copiados para la a mao, uma vez)
    os arquivos _*.json da raiz: as credenciais do YouTube (_google_oauth,
    _youtube_token*) e o estado do culto (ordem, marcas do louvor, progresso
    do guia, a chave "aceitar comandos pela web")

A primeira versao deixava os _*.json de fora, e o PC instalado pelo cofre
nascia sem falar com o YouTube e com o culto do zero. O Paulo pediu que
fossem (12/11/2026): um PC que assume no lugar do principal tem que assumir
de verdade. ATENCAO ao que isso significa: quem tira o cofre da web leva as
credenciais do canal do YouTube.

O QUE NAO VAI: _atualizou.json (a marca de uma atualizacao em andamento
NESTA maquina) e _obs_stream_anterior.json (copia de seguranca da chave de
transmissao que estava NESTE OBS).

SAO SEGREDOS. Saem daqui so por HTTPS, com a chave da web no cabecalho, e a
web so os entrega a quem tem um codigo de instalacao (ver web/app.py).
"""

import base64
import json
import os
import threading
import time
import urllib.request

FIXOS = ("config.yaml", "chegada.yaml", "looks_salvas.yaml", "patch.yaml")
PASTA_OBS = "obs"
# Estado que so faz sentido na maquina onde nasceu.
SO_DAQUI = ("_atualizou.json", "_obs_stream_anterior.json")
MAXIMO_POR_ARQUIVO = 4 * 1024 * 1024
MAXIMO_NO_TOTAL = 8 * 1024 * 1024
PAUSA = 60.0
PAUSA_COM_ERRO = 300.0


class Cofre:
    def __init__(self, url, chave, raiz, nome="", timeout=30.0):
        self._url = str(url).rstrip("/") + "/api/cofre"
        self._chave = str(chave)
        self._raiz = raiz
        self._nome = nome
        self._timeout = timeout
        self._entregue = None
        self._estado = {"ok": None, "em": None, "erro": None, "arquivos": 0}

    def comecar(self):
        threading.Thread(target=self._laco, daemon=True).start()

    def retrato(self):
        return dict(self._estado)

    def _lista(self):
        """[(nome no cofre, caminho no disco)], so do que existe e cabe."""
        achados = [(n, os.path.join(self._raiz, n)) for n in FIXOS]
        for nome in sorted(os.listdir(self._raiz)):
            if nome.startswith("_") and nome.endswith(".json") and nome not in SO_DAQUI:
                achados.append((nome, os.path.join(self._raiz, nome)))
        base = os.path.join(self._raiz, PASTA_OBS)
        for pasta, _subpastas, arquivos in os.walk(base):
            for arquivo in sorted(arquivos):
                caminho = os.path.join(pasta, arquivo)
                relativo = os.path.relpath(caminho, self._raiz).replace(os.sep, "/")
                if relativo.count("/") <= 3:      # obs/profiles/<nome>/arquivo
                    achados.append((relativo, caminho))
        return [(n, c) for n, c in achados
                if os.path.isfile(c) and os.path.getsize(c) <= MAXIMO_POR_ARQUIVO]

    def _laco(self):
        while True:
            pausa = PAUSA
            try:
                lista = self._lista()
                assinatura = [(n, os.path.getmtime(c), os.path.getsize(c)) for n, c in lista]
                if lista and assinatura != self._entregue:
                    self._entregar(lista)
                    self._entregue = assinatura
                    self._estado = {"ok": True, "em": time.time(), "erro": None,
                                    "arquivos": len(lista)}
            except Exception as erro:
                # A chave nunca aparece numa mensagem de erro: URL e cabecalho
                # ficam fora do texto de proposito.
                self._estado = dict(self._estado, ok=False,
                                    erro=type(erro).__name__ + ": " + str(erro)[:160])
                pausa = PAUSA_COM_ERRO
            time.sleep(pausa)

    def _entregar(self, lista):
        arquivos, total = {}, 0
        for nome, caminho in lista:
            with open(caminho, "rb") as arq:
                conteudo = arq.read()
            total += len(conteudo)
            if total > MAXIMO_NO_TOTAL:
                raise ValueError("a configuracao passou de 8 MB; confira a pasta obs/")
            arquivos[nome] = base64.b64encode(conteudo).decode("ascii")
        corpo = json.dumps({"maquina": self._nome, "arquivos": arquivos}).encode("utf-8")
        pedido = urllib.request.Request(
            self._url, data=corpo, method="POST",
            headers={"Content-Type": "application/json", "X-Ponte-Chave": self._chave})
        with urllib.request.urlopen(pedido, timeout=self._timeout) as resposta:
            resposta.read()
