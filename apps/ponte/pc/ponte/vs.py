"""O VS (a faixa com o click e os instrumentos gravados): quem manda tocar.

COMO E HOJE. O VS toca no PC do som, no Reaper, e quem aperta o play e uma
pessoa. A Ponte nao manda nele. Para a letra acompanhar, alguem toca em
"Comecou" no painel (o relogio `cronometro`), ou o audio toca num navegador
em ensaio (o relogio `navegador`).

COMO FICA. O celular do musico passa a pedir: tocar esta musica do comeco, ir
para tal segundo (pular ou repetir uma parte), parar. Este arquivo guarda o
ULTIMO PEDIDO, numerado, e quem toca o audio vem buscar:

  navegador  a tela do painel que esta tocando o audio em ensaio obedece na
             hora. E o que da para ver funcionando sem a igreja.
  reaper     a ponte do PC do som busca o pedido (como ja busca a luz) e
             manda no Reaper pela interface web dele. Ver vs_reaper.py.
             NUNCA RODOU COM UM REAPER.

O INTERRUPTOR. `vs: { ativo: false }` no config.yaml e o de fabrica: nenhum
pedido e publicado, e os botoes do musico so mexem no relogio da propria
Ponte (quando ele e o cronometro) ou passam a letra a mao. Ligar e uma
decisao de quem opera o som, depois de testar com o equipamento.

O sentido da conversa continua o de sempre: quem toca o audio LIGA para a
ponte principal e pergunta. A principal nunca chama ninguem.
"""

import threading
import time

DRIVERS = ("nenhum", "navegador", "reaper")


class Transporte:
    def __init__(self, config, relogio, agora=time.time):
        conf = config if isinstance(config, dict) else {}
        driver = str(conf.get("driver") or "nenhum")
        self.driver = driver if driver in DRIVERS else "nenhum"
        self.ativo = bool(conf.get("ativo")) and self.driver != "nenhum"
        self._relogio = relogio
        self._agora = agora
        self._tranca = threading.Lock()
        self._n = 0
        self._pedido = None
        self._buscado_em = None
        self._buscado_por = None

    def pode_posicionar(self):
        """Da para mudar o segundo em que a musica esta? So com alguem
        obedecendo (o VS ligado) ou com o relogio contado pela propria ponte."""
        return self.ativo or self._relogio.fonte == "cronometro"

    def _pedir(self, acao, musica, posicao, titulo=None):
        with self._tranca:
            self._n += 1
            self._pedido = {"n": self._n, "acao": acao, "musica": str(musica) if musica is not None else None,
                            "titulo": titulo, "posicao": round(float(posicao or 0.0), 3), "em": self._agora()}

    def tocar(self, musica, posicao=0.0, titulo=None):
        """Solta o VS desta musica, do segundo pedido."""
        self._relogio.posicionar(musica, posicao, True)
        self._pedir("tocar", musica, posicao, titulo)

    def ir_para(self, musica, posicao, titulo=None):
        """Pula para um segundo da musica que esta tocando."""
        self._relogio.posicionar(musica, posicao, True)
        self._pedir("ir", musica, posicao, titulo)

    def parar(self):
        self._relogio.parar()
        self._pedir("parar", None, 0.0)

    def pedido(self, quem=None):
        """O ultimo pedido, para quem toca o audio. None com o VS desligado."""
        with self._tranca:
            self._buscado_em = self._agora()
            self._buscado_por = str(quem or "")[:60] or None
            if not self.ativo or self._pedido is None:
                return None
            return dict(self._pedido)

    def retrato(self):
        with self._tranca:
            alguem = self._buscado_em is not None and self._agora() - self._buscado_em < 5
            return {"ativo": self.ativo, "driver": self.driver, "n": self._n,
                    "alguem_obedece": bool(self.ativo and alguem), "quem": self._buscado_por if alguem else None}
