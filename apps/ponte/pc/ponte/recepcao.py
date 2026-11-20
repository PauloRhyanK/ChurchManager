"""O YouTube esta RECEBENDO o que o OBS manda?

O PROBLEMA. O painel dizia "no ar" olhando so para o OBS. Ja aconteceu de o
OBS estar enviando e o YouTube nao estar recebendo nada: chave de outra
transmissao, transmissao que ninguem iniciou, ou o envio chegando morto. Do
lado da igreja tudo parecia certo, e quem avisava era alguem de casa.

O QUE ESTE ARQUIVO FAZ. Com o OBS enviando, pergunta ao YouTube duas coisas:

  o STREAM (a chave):      esta ativo? com que saude?
  a TRANSMISSAO do dia:    esta no ar, ou so pronta? esta presa a que stream?

e compara com a chave que o OBS esta usando. Sai um de cinco casos:

  ok            o YouTube recebe e a transmissao esta no ar
  aguardando    o OBS comecou ha menos de 30 s: ainda nao da para cobrar
  nao_recebe    "O YouTube não está recebendo"
  outra_chave   "A chave do OBS é de outra transmissão"
  nao_iniciada  "Chegando no YouTube, mas a transmissão não foi iniciada"

NADA ACONTECE SOZINHO. Este arquivo so diagnostica e diz que botao oferecer.
Quem aperta e uma pessoa.

RITMO. Nos 3 primeiros minutos de envio, uma conferencia a cada 15 s (e na
largada que o erro aparece); depois, a cada 2 minutos. Cada conferencia custa
2 ou 3 unidades da cota do YouTube (ver `CUSTO` abaixo).

A CHAVE DO OBS NUNCA E GUARDADA NEM ESCRITA EM LUGAR NENHUM: so o resumo dela
(SHA-256), para saber quando mudou e nao perguntar de novo ao YouTube de
quem ela e.
"""

import hashlib
import threading
import time

ESPERA = 30.0            # segundos de envio antes de cobrar o YouTube
LARGADA = 180.0          # segundos em que a conferencia e rapida
RAPIDO = 15.0
NORMAL = 120.0
# Unidades da cota do YouTube (10.000 por dia): toda leitura custa 1.
#   por conferencia: transmissao ativa (1) [+ agendada (1), se nao ha ativa]
#                    + estado dos streams, numa chamada so (1)  = 2 ou 3
#   uma vez por chave do OBS: lista de chaves (1) + valor de cada uma (1 cada)
CUSTO = {"conferencia": 3, "identificar_chave_base": 1}

TEXTOS = {
    "nao_recebe": "O YouTube não está recebendo",
    "outra_chave": "A chave do OBS é de outra transmissão",
    "nao_iniciada": "Chegando no YouTube, mas a transmissão não foi iniciada",
    "sem_transmissao": "Não achei uma transmissão no YouTube para hoje",
}
ALERTAS = tuple(TEXTOS)


def diagnosticar(enviando_ha, stream_do_obs, transmissao, streams):
    """O caso, a partir do que o OBS e o YouTube disseram.

    enviando_ha    segundos desde que o OBS comecou a enviar
    stream_do_obs  id do stream do YouTube cuja chave esta no OBS, ou None se
                   a chave do OBS nao e de nenhuma chave deste canal
    transmissao    {"id", "ciclo", "stream"} da transmissao do dia, ou None
    streams        {id: {"estado", "saude"}} do que o YouTube disse dos streams
    """
    if enviando_ha is None:
        return {"caso": "fora_do_ar", "texto": "", "detalhe": "", "acoes": []}
    if enviando_ha < ESPERA:
        return {"caso": "aguardando", "texto": "Conferindo se o YouTube está recebendo",
                "detalhe": "o OBS começou a enviar há {} s".format(int(enviando_ha)), "acoes": []}
    if transmissao is None:
        return {"caso": "sem_transmissao", "texto": TEXTOS["sem_transmissao"],
                "detalhe": "O OBS está enviando, mas o canal não tem transmissão no ar nem preparada.",
                "acoes": ["reconectar"]}
    presa = transmissao.get("stream")
    dela = (streams or {}).get(presa) or {}
    recebendo = dela.get("estado") == "active" and dela.get("saude") not in ("noData", None)
    if presa and stream_do_obs and presa != stream_do_obs:
        return {"caso": "outra_chave", "texto": TEXTOS["outra_chave"],
                "detalhe": "O OBS envia para uma chave, e a transmissão de hoje espera outra.",
                "acoes": ["usar_chave", "reconectar"]}
    if not recebendo:
        if presa and stream_do_obs is None:
            # A chave do OBS nao e de nenhuma chave deste canal, e a
            # transmissao nao recebe nada: e a chave.
            return {"caso": "outra_chave", "texto": TEXTOS["outra_chave"],
                    "detalhe": "A chave que está no OBS não é de nenhuma chave deste canal.",
                    "acoes": ["usar_chave", "reconectar"]}
        return {"caso": "nao_recebe", "texto": TEXTOS["nao_recebe"],
                "detalhe": "O OBS diz que envia, e o YouTube diz que não chega nada"
                           + (" (sem dados)." if dela.get("saude") == "noData" else " (chave parada)."),
                "acoes": ["reconectar"]}
    if transmissao.get("ciclo") != "live":
        return {"caso": "nao_iniciada", "texto": TEXTOS["nao_iniciada"],
                "detalhe": "O envio chega bem, mas quem assiste ainda não vê nada.",
                "acoes": ["iniciar"]}
    return {"caso": "ok", "texto": "O YouTube está recebendo", "detalhe": "", "acoes": []}


class VigiaDaRecepcao:
    def __init__(self, clientes, chave_do_obs, enviando_ha, anotar, agora=time.time):
        self._clientes = clientes          # funcao: [(nome do canal, cliente autorizado)]
        self._chave_do_obs = chave_do_obs  # funcao: a chave que esta no OBS (so para comparar)
        self._enviando_ha = enviando_ha    # funcao: segundos de envio, ou None fora do ar
        self._anotar = anotar
        self._agora = agora
        self._tranca = threading.Lock()
        self._dados = None
        self._conferido_em = None
        self._pedir = False
        self._resumo_da_chave = None
        self._stream_do_obs = None
        self._alvo = None                  # (cliente, transmissao, stream do obs) da ultima conferencia
        self._caso_anotado = None
        self.consultas = 0                 # unidades de cota gastas desde que a ponte subiu

    # -- o ritmo -------------------------------------------------------------

    def intervalo(self, enviando_ha):
        return RAPIDO if enviando_ha is not None and enviando_ha < LARGADA else NORMAL

    def conferir_ja(self):
        self._pedir = True

    def _identificar(self, cliente):
        """De qual stream do canal e a chave que esta no OBS? Guardado
        enquanto a chave nao muda."""
        chave = self._chave_do_obs()
        if not chave:
            self._resumo_da_chave, self._stream_do_obs = None, None
            return None
        resumo = hashlib.sha256(str(chave).encode("utf-8")).hexdigest()
        if resumo == self._resumo_da_chave:
            return self._stream_do_obs
        achado = None
        self.consultas += 1
        for item in cliente.chaves():
            if not item.get("tem_chave"):
                continue
            self.consultas += 1
            if cliente.chave_de(item["id"])["chave"] == chave:
                achado = item["id"]
                break
        self._resumo_da_chave, self._stream_do_obs = resumo, achado
        return achado

    def passo(self):
        """Uma volta do vigia. Consulta o YouTube so quando esta na hora."""
        enviando_ha = self._enviando_ha()
        agora = self._agora()
        if enviando_ha is None:
            with self._tranca:
                self._dados, self._conferido_em, self._alvo = None, None, None
            self._anotar_virada("fora_do_ar", None)
            return
        if enviando_ha < ESPERA:
            with self._tranca:
                self._dados = dict(diagnosticar(enviando_ha, None, None, None), lido_em=None)
            return
        na_hora = (self._pedir or self._conferido_em is None
                   or agora - self._conferido_em >= self.intervalo(enviando_ha))
        if not na_hora:
            return
        self._pedir = False
        clientes = self._clientes()
        if not clientes:
            return
        try:
            escolhido = None
            for nome, cliente in clientes:
                self.consultas += 1
                transmissao = cliente.transmissao("active")
                if transmissao is None:
                    self.consultas += 1
                    transmissao = cliente.transmissao("upcoming")
                if transmissao is not None or escolhido is None:
                    escolhido = (nome, cliente, transmissao)
                if transmissao is not None:
                    break
            nome, cliente, bruta = escolhido
            do_obs = self._identificar(cliente)
            transmissao = None
            ids = [do_obs] if do_obs else []
            if bruta is not None:
                transmissao = {"id": bruta.get("id"),
                               "ciclo": (bruta.get("status") or {}).get("lifeCycleStatus"),
                               "stream": (bruta.get("contentDetails") or {}).get("boundStreamId"),
                               "titulo": (bruta.get("snippet") or {}).get("title")}
                if transmissao["stream"] and transmissao["stream"] not in ids:
                    ids.append(transmissao["stream"])
            streams = {}
            if ids:
                self.consultas += 1
                streams = cliente.estado_dos_streams(ids)
            dados = diagnosticar(enviando_ha, do_obs, transmissao, streams)
            dados.update({"lido_em": time.strftime("%H:%M:%S", time.localtime(agora)), "canal": nome,
                          "titulo": (transmissao or {}).get("titulo")})
            with self._tranca:
                self._dados, self._conferido_em = dados, agora
                self._alvo = (cliente, transmissao, do_obs)
            self._anotar_virada(dados["caso"], dados)
        except Exception as erro:
            with self._tranca:
                self._conferido_em = agora
                # Nao saber nao e alerta: o YouTube fora do ar, ou a internet,
                # nao pode pintar o painel de vermelho sozinho.
                self._dados = {"caso": "desconhecido", "texto": "Não consegui perguntar ao YouTube",
                               "detalhe": str(erro)[:160], "acoes": [],
                               "lido_em": time.strftime("%H:%M:%S", time.localtime(agora))}

    def _anotar_virada(self, caso, dados):
        """No "Aconteceu agora", so quando o caso MUDA."""
        antes, self._caso_anotado = self._caso_anotado, caso
        if antes == caso:
            return
        if caso in ALERTAS:
            self._anotar(dados["texto"], False, dados["detalhe"])
        elif caso == "ok" and antes in ALERTAS:
            self._anotar("O YouTube voltou a receber", True, "tudo certo")

    def comecar(self):
        def laco():
            while True:
                try:
                    self.passo()
                except Exception as erro:
                    print("  [youtube] conferencia falhou: {}".format(erro))
                time.sleep(3)
        threading.Thread(target=laco, daemon=True).start()

    def retrato(self):
        with self._tranca:
            return dict(self._dados) if self._dados else None

    # -- as acoes, sempre a pedido de alguem ----------------------------------

    def alvo(self):
        with self._tranca:
            return self._alvo

    def iniciar_no_youtube(self):
        """Poe no ar a transmissao que esta pronta. So com o envio chegando."""
        alvo = self.alvo()
        dados = self.retrato()
        if alvo is None or alvo[1] is None or not dados:
            return {"erro": "não achei a transmissão no YouTube. Espere a próxima conferência."}, 409
        if dados["caso"] != "nao_iniciada":
            return {"erro": "a transmissão não está esperando para ser iniciada"}, 409
        self.consultas += 50
        alvo[0].iniciar(alvo[1]["id"])
        self.conferir_ja()
        return {"ok": True, "titulo": "Transmissão iniciada no YouTube", "detalhe": "tudo certo"}, 200

    def stream_da_transmissao(self):
        alvo = self.alvo()
        if alvo is None or alvo[1] is None or not alvo[1].get("stream"):
            return None, None
        return alvo[0], alvo[1]["stream"]
