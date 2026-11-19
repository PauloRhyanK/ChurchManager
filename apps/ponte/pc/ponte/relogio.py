"""O relogio da musica: em que segundo ela esta AGORA.

A TELA NUNCA E O RELOGIO. Quem sabe onde a musica esta e uma FONTE, que avisa
a ponte; a ponte guarda o aviso e anda sozinha entre um aviso e outro. Quem
conduz a letra e a luz (condutor.py) so pergunta `ler()` e nao sabe quem e a
fonte. E isso que faz a troca do audio-no-navegador pelo Reaper ser trocar
quem avisa, e nada mais.

Fontes:
  navegador   uma tela tocando o audio da musica avisa 4 vezes por segundo.
              Serve para ensaio e teste.
  cronometro  ninguem avisa: o operador toca em "Comecou" e a ponte conta.
  reaper      a ponte do PC do som avisa a posicao do Reaper. A rota e a
              mesma; ler o Reaper e trabalho de outra etapa.

Sem aviso ha mais de 3 segundos, o relogio diz que esta SEM SINAL e para de
andar. Melhor a letra parada num verso do que correndo sozinha atras de uma
musica que ninguem sabe onde esta.
"""

import threading
import time

FONTES = ("navegador", "cronometro", "reaper")


class Relogio:
    def __init__(self, fonte="navegador", adiantar_ms=0, agora=time.monotonic, validade=3.0):
        self._fonte = fonte if fonte in FONTES else "navegador"
        try:
            self._adiantar = float(adiantar_ms or 0) / 1000.0
        except (TypeError, ValueError):
            self._adiantar = 0.0
        self._agora = agora
        self._validade = float(validade)
        self._tranca = threading.Lock()
        self._musica = None
        self._posicao = None
        self._tocando = False
        self._em = None

    @property
    def fonte(self):
        return self._fonte

    def avisar(self, fonte, musica, posicao, tocando):
        """Uma fonte dizendo onde a musica esta. Falso se nao e a fonte escolhida."""
        if fonte != self._fonte or fonte == "cronometro":
            return False
        try:
            posicao = float(posicao)
        except (TypeError, ValueError):
            return False
        if posicao < 0 or posicao != posicao:
            return False
        with self._tranca:
            self._musica = str(musica) if musica is not None else None
            self._posicao = posicao
            self._tocando = bool(tocando)
            self._em = self._agora()
        return True

    def comecar(self, musica):
        """O 'Comecou' do operador. So existe com a fonte cronometro."""
        if self._fonte != "cronometro":
            return False
        with self._tranca:
            self._musica = str(musica) if musica is not None else None
            self._posicao = 0.0
            self._tocando = True
            self._em = self._agora()
        return True

    def acertar(self, segundos):
        """Adianta (positivo) ou atrasa (negativo) o cronometro."""
        if self._fonte != "cronometro":
            return False
        with self._tranca:
            if self._posicao is None:
                return False
            agora = self._agora()
            atual = self._posicao + (agora - self._em if self._tocando else 0.0)
            self._posicao = max(0.0, atual + float(segundos))
            self._em = agora
        return True

    def parar(self):
        with self._tranca:
            self._musica = None
            self._posicao = None
            self._tocando = False
            self._em = None

    def ler(self):
        with self._tranca:
            if self._posicao is None:
                return {"fonte": self._fonte, "musica": self._musica, "posicao": None,
                        "tocando": False, "sinal": False}
            passou = self._agora() - self._em
            sinal = True
            if self._fonte != "cronometro" and passou > self._validade:
                sinal = False
                passou = self._validade
            posicao = self._posicao + (passou if self._tocando else 0.0)
            return {"fonte": self._fonte, "musica": self._musica,
                    "posicao": round(max(0.0, posicao + self._adiantar), 3),
                    "tocando": bool(self._tocando and sinal), "sinal": sinal}
