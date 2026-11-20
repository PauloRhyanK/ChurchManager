"""O lado do PC do som: buscar o pedido do VS e mandar no Reaper.

NUNCA RODOU COM UM REAPER. Foi escrito a partir do que a interface web do
Reaper (Preferencias > Control/OSC/web > Web browser interface) costuma
aceitar, e testado so contra respostas de mentira:

    GET /_/TRANSPORT           -> "TRANSPORT\\t<estado>\\t<segundos>\\t..."
                                  (estado 1 = tocando)
    GET /_/REGION              -> "REGION\\t<nome>\\t<id>\\t<inicio>\\t<fim>\\t..."
    GET /_/SET/POS/<segundos>  -> move o cursor
    GET /_/1007                -> play        GET /_/1016 -> stop

Cada musica e uma REGIAO do projeto do Reaper, com o titulo da musica no nome
(ou o nome escrito em `vs.reaper.regioes` do config). A posicao que a Ponte
pede e contada do comeco da musica; aqui ela vira posicao do projeto somando o
inicio da regiao.

Roda no PC do som, que LIGA para a ponte principal (como ja faz para a luz):
pergunta o pedido, obedece, e avisa em que segundo a musica esta (o relogio
`reaper`). A principal nunca chama o PC do som.
"""

import json
import threading
import time
import unicodedata
import urllib.parse
import urllib.request

PAUSA = 0.25


def _limpo(texto):
    texto = "".join(c for c in unicodedata.normalize("NFD", str(texto or ""))
                    if unicodedata.category(c) != "Mn")
    return "".join(c for c in texto.lower() if c.isalnum())


def ler_transporte(texto):
    """(tocando, segundos) da resposta do TRANSPORT. None se nao entendeu."""
    for linha in str(texto or "").splitlines():
        campos = linha.split("\t")
        if campos[0] == "TRANSPORT" and len(campos) >= 3:
            try:
                return campos[1] == "1", float(campos[2])
            except ValueError:
                return None
    return None


def ler_regioes(texto):
    """[{nome, inicio, fim}] da resposta do REGION."""
    regioes = []
    for linha in str(texto or "").splitlines():
        campos = linha.split("\t")
        if campos[0] == "REGION" and len(campos) >= 5:
            try:
                regioes.append({"nome": campos[1], "inicio": float(campos[3]), "fim": float(campos[4])})
            except ValueError:
                continue
    return regioes


def achar_regiao(regioes, musica, titulo, mapa=None):
    """A regiao desta musica: pelo nome escrito no config, senao pelo titulo."""
    mapa = mapa or {}
    procurado = _limpo(mapa.get(str(musica)) or mapa.get(str(titulo)) or titulo)
    if not procurado:
        return None
    for regiao in regioes:
        if _limpo(regiao["nome"]) == procurado:
            return regiao
    for regiao in regioes:
        if procurado in _limpo(regiao["nome"]):
            return regiao
    return None


class AgenteDoReaper:
    def __init__(self, principal, config=None, buscar=None, agora=time.time):
        conf = config if isinstance(config, dict) else {}
        self._principal = str(principal).rstrip("/")
        self._reaper = "http://{}:{}/_/".format(conf.get("host", "127.0.0.1"), conf.get("porta", 8080))
        self._mapa = conf.get("regioes") or {}
        self._buscar = buscar or self._pela_rede
        self._agora = agora
        self._feito = 0           # numero do ultimo pedido obedecido
        self._musica = None       # a musica que esta tocando, e onde ela comeca no projeto
        self._inicio = 0.0
        self.erro = None

    @staticmethod
    def _pela_rede(url, corpo=None):
        dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
        pedido = urllib.request.Request(url, data=dados, method="POST" if corpo is not None else "GET",
                                        headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(pedido, timeout=3.0) as resposta:
            return resposta.read().decode("utf-8", errors="replace")

    def _obedecer(self, pedido):
        if pedido["acao"] == "parar":
            self._buscar(self._reaper + "1016")
            self._musica = None
            return
        if pedido["musica"] != self._musica:
            regiao = achar_regiao(ler_regioes(self._buscar(self._reaper + "REGION")),
                                  pedido["musica"], pedido.get("titulo"), self._mapa)
            if regiao is None:
                raise RuntimeError("não achei no Reaper a região da música {!r}".format(
                    pedido.get("titulo") or pedido["musica"]))
            self._musica, self._inicio = pedido["musica"], regiao["inicio"]
        self._buscar(self._reaper + "SET/POS/{:.3f}".format(self._inicio + float(pedido["posicao"])))
        if pedido["acao"] == "tocar" or not (ler_transporte(self._buscar(self._reaper + "TRANSPORT")) or (False,))[0]:
            self._buscar(self._reaper + "1007")

    def passo(self):
        """Uma volta: busca o pedido, obedece se for novo, avisa a posicao."""
        try:
            resposta = json.loads(self._buscar(
                self._principal + "/api/vs/pedido?quem=" + urllib.parse.quote("PC do som")))
            pedido = resposta.get("pedido")
            if pedido and pedido.get("n", 0) > self._feito:
                self._feito = pedido["n"]
                self._obedecer(pedido)
            if self._musica is not None:
                estado = ler_transporte(self._buscar(self._reaper + "TRANSPORT"))
                if estado is not None:
                    self._buscar(self._principal + "/api/relogio", {
                        "fonte": "reaper", "musica": self._musica,
                        "posicao": max(0.0, estado[1] - self._inicio), "tocando": estado[0]})
            self.erro = None
        except Exception as erro:
            self.erro = str(erro)[:160]

    def comecar(self):
        def laco():
            while True:
                self.passo()
                time.sleep(PAUSA if self.erro is None else 5.0)
        threading.Thread(target=laco, daemon=True).start()
