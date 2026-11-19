"""Ouve o nivel de audio do OBS, numa conexao so dele.

POR QUE UMA CONEXAO SEPARADA. O cliente das cues (obs.py) se inscreve em ZERO
eventos, de proposito: ele manda um pedido e espera a resposta, e um fluxo de
eventos no meio atrapalha essa conversa. O nivel de audio so existe como
evento (InputVolumeMeters), e e o evento mais tagarela do OBS: uma mensagem a
cada 50 ms com todas as entradas. Entao ele ganha o seu proprio fio, que nao
manda pedido nenhum, e o resto da ponte nem sabe que ele existe.

O QUE A TELA MOSTRA e "tem som? esta estourando?", nao um medidor de estudio:
daqui sai o PICO de cada entrada no ultimo segundo, e uma palavra.
"""

import base64
import hashlib
import json
import math
import threading
import time

from .obs import _host_para_url

INPUT_VOLUME_METERS = 1 << 16
PISO_DB = -60.0
ESPERA_ENTRE_TENTATIVAS = 10.0


def pico_db(niveis):
    """O maior pico entre os canais de uma entrada, em dB.

    `niveis` e o inputLevelsMul do evento: uma lista por canal, cada uma
    [magnitude, pico, pico de entrada], em escala linear (1.0 = 0 dB).
    """
    maior = 0.0
    try:
        for canal in niveis or []:
            valor = float(canal[1])
            if valor > maior:
                maior = valor
    except (TypeError, ValueError, IndexError):
        return -100.0
    if maior <= 0.0:
        return -100.0
    return max(-100.0, 20.0 * math.log10(maior))


def palavra(db):
    """(palavra, cor, porcentagem da barra) para um pico em dB."""
    pct = int(round(max(0.0, min(1.0, (db - PISO_DB) / -PISO_DB)) * 100))
    if db < -60.0:
        return "fechado", "cinza", 0
    if db < -30.0:
        return "baixo", "ambar", pct
    if db < -6.0:
        return "bom", "verde", pct
    if db < -1.0:
        return "alto", "ambar", pct
    return "estourando", "vermelho", pct


class Medidor:
    """Guarda o pico recente de cada entrada. Nao sabe de rede."""

    JANELA = 1.0        # a tela mostra o pico do ultimo segundo
    SEM_LEITURA = 3.0   # sem evento ha mais que isso, nao ha o que mostrar

    def __init__(self, agora=time.monotonic):
        self._agora = agora
        self._tranca = threading.Lock()
        self._picos = {}     # entrada -> [(instante, db), ...] recentes
        self._ordem = []     # entradas na ordem em que apareceram
        self._visto = None

    def receber(self, inputs):
        agora = self._agora()
        if not isinstance(inputs, list):
            return
        with self._tranca:
            self._visto = agora
            for item in inputs:
                if not isinstance(item, dict) or not item.get("inputName"):
                    continue
                nome = str(item["inputName"])
                db = pico_db(item.get("inputLevelsMul"))
                lista = self._picos.get(nome)
                if lista is None:
                    lista = self._picos[nome] = []
                    self._ordem.append(nome)
                # Um pico a cada 250 ms basta: dentro desse intervalo so o
                # maior fica, e a memoria nao cresce com a tagarelice do OBS.
                if lista and agora - lista[-1][0] < 0.25:
                    if db > lista[-1][1]:
                        lista[-1] = (lista[-1][0], db)
                else:
                    lista.append((agora, db))
                while lista and agora - lista[0][0] > self.JANELA:
                    lista.pop(0)

    def vivo(self):
        return self._visto is not None and self._agora() - self._visto <= self.SEM_LEITURA

    def retrato(self, entradas=None):
        """[{nome, entrada, estado, cor, nivel, palavra}] para a tela.

        `entradas` e a lista obs.audios do config; sem ela, as quatro
        primeiras que o OBS mostrou, com o nome que tem la.
        """
        agora = self._agora()
        with self._tranca:
            if self._visto is None or agora - self._visto > self.SEM_LEITURA:
                return []
            if entradas:
                pedidas = [(str(e.get("entrada") or ""), str(e.get("nome") or e.get("entrada") or ""),
                            bool(e.get("palavra"))) for e in entradas if isinstance(e, dict)]
            else:
                pedidas = [(n, n, False) for n in self._ordem[:4]]
            saida = []
            for entrada, nome, da_palavra in pedidas:
                recentes = [db for quando, db in self._picos.get(entrada, [])
                            if agora - quando <= self.JANELA]
                if entrada not in self._picos:
                    saida.append({"nome": nome, "entrada": entrada, "estado": "não achei no OBS",
                                  "cor": "cinza", "nivel": 0, "palavra": da_palavra})
                    continue
                estado, cor, nivel = palavra(max(recentes) if recentes else -100.0)
                saida.append({"nome": nome, "entrada": entrada, "estado": estado, "cor": cor,
                              "nivel": nivel, "palavra": da_palavra})
            return saida


class OuvinteOBS:
    """O fio que fica ouvindo. Se cair, tenta de novo de 10 em 10 segundos."""

    def __init__(self, host, porta, senha, medidor, timeout=6.0):
        self._url = "ws://{}:{}".format(_host_para_url(host), porta)
        self._senha = senha or ""
        self._medidor = medidor
        self._timeout = timeout

    def comecar(self):
        threading.Thread(target=self._laco, daemon=True).start()

    def vivo(self):
        return self._medidor.vivo()

    def _laco(self):
        while True:
            try:
                self._ouvir()
            except Exception:
                # Sem OBS nao ha barra de audio, e so. Nada mais depende disto.
                pass
            time.sleep(ESPERA_ENTRE_TENTATIVAS)

    def _ouvir(self):
        import websocket  # pacote websocket-client

        ws = websocket.create_connection(self._url, timeout=self._timeout)
        try:
            d = (json.loads(ws.recv()).get("d") or {})
            identify = {"rpcVersion": d.get("rpcVersion", 1),
                        "eventSubscriptions": INPUT_VOLUME_METERS}
            auth = d.get("authentication")
            if auth:
                segredo = base64.b64encode(
                    hashlib.sha256((self._senha + auth["salt"]).encode()).digest()).decode()
                identify["authentication"] = base64.b64encode(
                    hashlib.sha256((segredo + auth["challenge"]).encode()).digest()).decode()
            ws.send(json.dumps({"op": 1, "d": identify}))
            while True:
                bruto = ws.recv()
                if not bruto:
                    return
                try:
                    msg = json.loads(bruto)
                except ValueError:
                    continue
                corpo = msg.get("d") or {}
                if msg.get("op") == 5 and corpo.get("eventType") == "InputVolumeMeters":
                    self._medidor.receber((corpo.get("eventData") or {}).get("inputs"))
        finally:
            try:
                ws.close()
            except Exception:
                pass
