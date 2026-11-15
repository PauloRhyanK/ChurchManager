"""O espelho: entrega o estado do culto para a versao web e traz os pedidos de la.

O SENTIDO DA CONVERSA E O QUE IMPORTA AQUI. A versao web mora numa VPS, na
internet; a ponte mora dentro da rede da igreja, atras do roteador. De fora
ninguem consegue chamar a igreja — e isso e bom, e nao sera mudado: nao se
abre porta no roteador da igreja para a internet.

Entao quem liga e a igreja. A cada poucos segundos esta maquina faz UM pedido
de saida para a web, que serve para as duas direcoes:

    ida    o retrato do culto (o mesmo que a tela local mostra)
    volta  a fila de pedidos feitos por alguem na web

E o mesmo desenho do PC do som com a luz (ver seguidor.py), pelo mesmo motivo.

O QUE ISTO GARANTE: sem internet, o culto nao sente nada. Este laco falha,
espera e tenta de novo; nada do painel local depende dele.
"""

import json
import threading
import time
import urllib.error
import urllib.request

PAUSA = 2.0
PAUSA_COM_ERRO = 10.0


class Espelho:
    def __init__(self, url, chave, retrato, executar, nome="", timeout=6.0, extra=None):
        self._url = str(url).rstrip("/") + "/api/espelho"
        self._chave = str(chave)
        self._retrato = retrato
        self._executar = executar
        self._nome = nome
        # `extra` devolve mais coisas para ir junto (o retrato do painel do
        # culto). Se falhar, o guia de chegada continua indo sozinho.
        self._extra = extra
        self._timeout = timeout
        self._estado = {"ok": None, "em": None, "erro": None}

    def comecar(self):
        threading.Thread(target=self._laco, daemon=True).start()

    def retrato(self):
        return dict(self._estado)

    def _laco(self):
        while True:
            pausa = PAUSA
            try:
                self._uma_volta()
                self._estado = {"ok": True, "em": time.time(), "erro": None}
            except Exception as erro:
                # A chave nunca aparece numa mensagem de erro: URL e cabecalho
                # ficam fora do texto de proposito.
                self._estado = {"ok": False, "em": self._estado.get("em"),
                                "erro": type(erro).__name__ + ": " + str(erro)[:160]}
                pausa = PAUSA_COM_ERRO
            time.sleep(pausa)

    def _uma_volta(self):
        dados = {"maquina": self._nome, "chegada": self._retrato()}
        if self._extra is not None:
            try:
                dados.update(self._extra())
            except Exception as erro:
                print("  [espelho] o retrato do painel falhou: {}".format(erro))
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        pedido = urllib.request.Request(
            self._url, data=corpo, method="POST",
            headers={"Content-Type": "application/json", "X-Ponte-Chave": self._chave})
        with urllib.request.urlopen(pedido, timeout=self._timeout) as resposta:
            dados = json.loads(resposta.read().decode("utf-8"))
        for comando in dados.get("comandos") or []:
            # Cada pedido roda na sua propria thread: abrir o retorno na TV
            # leva 20 segundos, e o espelho nao pode ficar esse tempo todo sem
            # entregar o estado.
            threading.Thread(target=self._rodar, args=(comando,), daemon=True).start()

    def _rodar(self, comando):
        try:
            self._executar(comando)
        except Exception as erro:
            print("  [espelho] pedido da web falhou ({}): {}".format(
                comando.get("tipo"), erro))
