"""Testes de "o YouTube esta recebendo?". Rodam sem YouTube e sem OBS:

    python _testar_recepcao.py

As respostas da API do YouTube sao de mentira, uma para cada caso. O que NAO
da para testar aqui: se o YouTube de verdade responde com esses campos nesses
momentos, e se a troca para "no ar" (transition) e aceita.
"""

import json
import os
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

PASTA = tempfile.mkdtemp()
os.environ["PONTE_SIMULAR"] = "1"
os.environ["PONTE_CONFIG"] = os.path.join(AQUI, "config.exemplo.yaml")

from ponte import recepcao   # noqa: E402
from ponte.recepcao import diagnosticar   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


AO_VIVO = {"id": "v1", "ciclo": "live", "stream": "s-hoje"}
PRONTA = {"id": "v1", "ciclo": "ready", "stream": "s-hoje"}
TESTANDO = {"id": "v1", "ciclo": "testing", "stream": "s-hoje"}
BOM = {"s-hoje": {"estado": "active", "saude": "good"}}
PARADO = {"s-hoje": {"estado": "inactive", "saude": "noData"}}
SEM_DADOS = {"s-hoje": {"estado": "active", "saude": "noData"}}

print("\nO diagnostico, caso a caso")
conferir("OBS fora do ar: nada a dizer", diagnosticar(None, None, None, None)["caso"] == "fora_do_ar")
d = diagnosticar(12, None, None, None)
conferir("menos de 30 s de envio: ainda nao cobra", d["caso"] == "aguardando" and d["acoes"] == [])
d = diagnosticar(60, "s-hoje", AO_VIVO, BOM)
conferir("tudo certo: ok, sem botao", d["caso"] == "ok" and d["acoes"] == [])
conferir("saude 'ok' e 'bad' ainda sao receber", diagnosticar(60, "s-hoje", AO_VIVO, {"s-hoje": {"estado": "active", "saude": "bad"}})["caso"] == "ok")
d = diagnosticar(60, "s-hoje", AO_VIVO, PARADO)
conferir("stream inativo: 'O YouTube não está recebendo', com Reconectar",
         d["caso"] == "nao_recebe" and d["texto"] == "O YouTube não está recebendo" and d["acoes"] == ["reconectar"], d)
conferir("stream ativo mas sem dados: tambem nao recebe", diagnosticar(60, "s-hoje", AO_VIVO, SEM_DADOS)["caso"] == "nao_recebe")
conferir("o YouTube nao disse nada do stream: nao recebe", diagnosticar(60, "s-hoje", AO_VIVO, {})["caso"] == "nao_recebe")
d = diagnosticar(60, "s-velho", AO_VIVO, {"s-velho": {"estado": "active", "saude": "good"}, "s-hoje": {"estado": "inactive", "saude": "noData"}})
conferir("o OBS envia para outro stream: 'A chave do OBS é de outra transmissão'",
         d["caso"] == "outra_chave" and d["texto"] == "A chave do OBS é de outra transmissão" and d["acoes"] == ["usar_chave", "reconectar"], d)
d = diagnosticar(60, None, AO_VIVO, PARADO)
conferir("a chave do OBS nao e de nenhuma chave do canal, e nada chega: e a chave", d["caso"] == "outra_chave", d)
conferir("chave desconhecida mas chegando (nao deu para identificar): nao acusa", diagnosticar(60, None, AO_VIVO, BOM)["caso"] == "ok")
d = diagnosticar(60, "s-hoje", PRONTA, BOM)
conferir("chegando, transmissao so pronta: 'não foi iniciada', com Iniciar no YouTube",
         d["caso"] == "nao_iniciada" and d["texto"] == "Chegando no YouTube, mas a transmissão não foi iniciada" and d["acoes"] == ["iniciar"], d)
conferir("em teste tambem nao esta no ar", diagnosticar(60, "s-hoje", TESTANDO, BOM)["caso"] == "nao_iniciada")
conferir("pronta E sem chegar nada: o problema e nao receber (iniciar nao adiantaria)", diagnosticar(60, "s-hoje", PRONTA, PARADO)["caso"] == "nao_recebe")
d = diagnosticar(60, "s-hoje", None, BOM)
conferir("canal sem transmissao nenhuma: avisa", d["caso"] == "sem_transmissao" and d["texto"])


class YouTube:
    """Respostas de mentira da API, no formato de ponte/youtube.py."""

    def __init__(self, ciclo="live", estado="active", saude="good", preso="s-hoje"):
        self.ciclo, self.estado, self.saude, self.preso = ciclo, estado, saude, preso
        self.chaves_do_canal = {"s-hoje": "CHAVE-SECRETA-DE-HOJE", "s-velho": "CHAVE-SECRETA-ANTIGA"}
        self.pedidos = []
        self.quebrado = False
        self.iniciadas = []

    def transmissao(self, estado="active"):
        self.pedidos.append("transmissao:" + estado)
        if self.quebrado:
            raise RuntimeError("sem conexao com o YouTube")
        if self.ciclo is None or (estado == "active") != (self.ciclo == "live"):
            return None
        return {"id": "v1", "snippet": {"title": "Culto"}, "status": {"lifeCycleStatus": self.ciclo},
                "contentDetails": {"boundStreamId": self.preso}}

    def chaves(self):
        self.pedidos.append("chaves")
        return [{"id": i, "tem_chave": True} for i in self.chaves_do_canal]

    def chave_de(self, id_stream):
        self.pedidos.append("chave_de")
        return {"chave": self.chaves_do_canal[id_stream], "servidor": "rtmp://x"}

    def estado_dos_streams(self, ids):
        self.pedidos.append("streams:" + ",".join(ids))
        return {i: {"estado": self.estado if i == self.preso else "active", "saude": self.saude if i == self.preso else "good"} for i in ids}

    def iniciar(self, id_transmissao):
        self.iniciadas.append(id_transmissao)
        self.ciclo = "live"


class Mundo:
    def __init__(self, yt=None, chave="CHAVE-SECRETA-DE-HOJE"):
        self.t = 1000.0
        self.enviando = None
        self.chave = chave
        self.yt = yt or YouTube()
        self.notas = []
        self.v = recepcao.VigiaDaRecepcao(lambda: [("Canal", self.yt)], lambda: self.chave, lambda: self.enviando,
                                          lambda titulo, ok, detalhe: self.notas.append((titulo, ok)), agora=lambda: self.t)

    def andar(self, segundos, passo=3.0):
        fim = self.t + segundos
        while self.t < fim:
            self.t += passo
            if self.enviando is not None:
                self.enviando += passo
            self.v.passo()


print("\nO ritmo da conferencia")
m = Mundo()
m.v.passo()
conferir("OBS fora do ar: nenhuma consulta ao YouTube", m.yt.pedidos == [] and m.v.retrato() is None)
m.enviando = 0.0
m.andar(27)
conferir("nos primeiros 30 s: 'conferindo', sem consultar", m.yt.pedidos == [] and m.v.retrato()["caso"] == "aguardando", m.v.retrato())
m.andar(6)
conferir("aos 30 s faz a primeira conferencia", m.v.retrato()["caso"] == "ok" and "transmissao:active" in m.yt.pedidos, m.yt.pedidos)
conferir("identifica de quem e a chave do OBS", "chaves" in m.yt.pedidos and m.yt.pedidos.count("chave_de") == 1)
primeiras = len([p for p in m.yt.pedidos if p.startswith("transmissao")])
m.andar(150)
rapidas = len([p for p in m.yt.pedidos if p.startswith("transmissao")]) - primeiras
conferir("ate os 3 minutos, uma conferencia a cada 15 s", 9 <= rapidas <= 10, rapidas)
conferir("a chave do OBS nao e perguntada de novo enquanto nao muda", m.yt.pedidos.count("chaves") == 1 and m.yt.pedidos.count("chave_de") == 1)
antes = len([p for p in m.yt.pedidos if p.startswith("transmissao")])
m.andar(600)
lentas = len([p for p in m.yt.pedidos if p.startswith("transmissao")]) - antes
conferir("depois, uma a cada 2 minutos", lentas == 5, lentas)
conferir("a conta da cota bate com as consultas feitas", m.v.consultas == len(m.yt.pedidos), (m.v.consultas, len(m.yt.pedidos)))
total = m.v.consultas
conferir("num culto de 2 h a conferencia gasta menos de 2% da cota diaria", total + 54 * 3 < 200, total)
conferir("o intervalo que o vigia declara", m.v.intervalo(10) == 15.0 and m.v.intervalo(179) == 15.0 and m.v.intervalo(181) == 120.0)

print("\nA chave do OBS nunca fica guardada")
conferir("so o resumo dela", "CHAVE-SECRETA" not in json.dumps({k: str(v) for k, v in vars(m.v).items() if k != "_chave_do_obs" and not callable(v)})
         and len(m.v._resumo_da_chave) == 64)
conferir("nem aparece no retrato", "CHAVE-SECRETA" not in json.dumps(m.v.retrato()))
m.chave = "CHAVE-SECRETA-ANTIGA"
m.v.conferir_ja()
m.andar(3)
conferir("trocaram a chave no OBS: identifica de novo, e acusa", m.yt.pedidos.count("chaves") == 2 and m.v.retrato()["caso"] == "outra_chave", m.v.retrato())

print("\nO que vai para o 'Aconteceu agora'")
m = Mundo(YouTube(estado="inactive", saude="noData"))
m.enviando = 0.0
m.andar(60)
conferir("o alerta e anotado", m.notas == [("O YouTube não está recebendo", False)], m.notas)
m.andar(120)
conferir("uma vez so, nao a cada conferencia", len(m.notas) == 1)
m.yt.estado, m.yt.saude = "active", "good"
m.andar(130)
conferir("quando volta, anota que voltou", m.notas[-1] == ("O YouTube voltou a receber", True), m.notas)
m.yt.ciclo = "ready"
m.v.conferir_ja()
m.andar(3)
conferir("outro caso: outro alerta", m.notas[-1] == ("Chegando no YouTube, mas a transmissão não foi iniciada", False))
bom = Mundo()
bom.enviando = 0.0
bom.andar(200)
conferir("tudo certo desde o comeco: nada e anotado", bom.notas == [])

print("\nNao saber nao e alerta")
m = Mundo()
m.yt.quebrado = True
m.enviando = 40.0
m.v.passo()
conferir("YouTube fora do ar: 'nao consegui perguntar', sem vermelho", m.v.retrato()["caso"] == "desconhecido" and m.notas == []
         and m.v.retrato()["caso"] not in recepcao.ALERTAS, m.v.retrato())
m.yt.quebrado = False
m.andar(18)
conferir("e tenta de novo no ritmo normal", m.v.retrato()["caso"] == "ok")
sem = recepcao.VigiaDaRecepcao(lambda: [], lambda: None, lambda: 60.0, lambda *a: None)
sem.passo()
conferir("nenhum canal autorizado: nao estoura", sem.retrato() is None)

print("\nIniciar no YouTube")
m = Mundo(YouTube(ciclo="ready"))
m.enviando = 40.0
m.v.passo()
conferir("o caso pede o botao", m.v.retrato()["acoes"] == ["iniciar"])
corpo, codigo = m.v.iniciar_no_youtube()
conferir("o botao poe a transmissao no ar", codigo == 200 and m.yt.iniciadas == ["v1"] and corpo["titulo"] == "Transmissão iniciada no YouTube")
m.andar(3)
conferir("e a conferencia seguinte confirma", m.v.retrato()["caso"] == "ok" and m.notas[-1] == ("O YouTube voltou a receber", True))
conferir("fora desse caso, o pedido e recusado (nada de iniciar sem o envio chegando)", m.v.iniciar_no_youtube()[1] == 409 and m.yt.iniciadas == ["v1"])
parado = Mundo(YouTube(ciclo="ready", estado="inactive", saude="noData"))
parado.enviando = 40.0
parado.v.passo()
conferir("pronta mas sem chegar nada: Iniciar nao e oferecido nem aceito",
         "iniciar" not in parado.v.retrato()["acoes"] and parado.v.iniciar_no_youtube()[1] == 409)

# ---------------------------------------------------------------------------
print("\nNo painel, com o YouTube e o OBS de mentira")
import app as ponte   # noqa: E402
from ponte import simulados   # noqa: E402

ponte.CAMINHO_PONTEIRO = os.path.join(PASTA, "_ordem_atual.json")
ponte.CAMINHO_LOUVOR = os.path.join(PASTA, "_louvor_atual.json")
ponte.CAMINHO_MARCAS = os.path.join(PASTA, "_marcas_louvor.json")
ponte.CAMINHO_PALAVRA = os.path.join(PASTA, "_palavra_do_dia.json")
ponte.RAIZ = PASTA      # o "_obs_stream_anterior.json" do teste nao vai para a pasta do projeto
ponte._config = ponte.carregar_config()
ponte._contexto = ponte.montar_contexto(ponte._config)
OBS = simulados.ObsSimulado()
YT = simulados.YouTubeSimulado(OBS)
ponte._contexto["obs"] = ponte._contexto["obs_saude"] = OBS
ponte._contexto["holyrics"] = ponte._contexto["holyrics_saude"] = simulados.HolyricsSimulado()
ponte._contexto["youtube"] = {"simulado": {"nome": "Canal de mentira", "cliente": YT}}
ponte._cues_por_id = ponte.indexar_cues(ponte._config)
ponte._ordens_por_id = ponte.indexar_ordens(ponte._config)
ponte._retomar_ordem(ponte._config)
ponte._recepcao["valor"] = ponte._montar_recepcao()
VIGIA = ponte._recepcao["valor"]
cliente = ponte.app.test_client()


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


def olhar(segundos_no_ar):
    """Faz de conta que o OBS envia ha tanto tempo, e confere."""
    OBS.transmitindo_desde = OBS._agora() - segundos_no_ar
    ponte._estado["obs"] = ponte._ler_estado_obs()
    VIGIA.conferir_ja()
    VIGIA.passo()
    return cliente.get("/api/painel").get_json()["transmissao"]


ponte._estado["obs"] = ponte._ler_estado_obs()
t = cliente.get("/api/painel").get_json()["transmissao"]
conferir("fora do ar: sem diagnostico", t["no_ar"] is False and t["recepcao"] is None)
conferir("as chaves antigas da transmissao continuam", {"imagem", "preparada", "no_ar", "gravando", "tempo_ms", "youtube"} <= set(t))
t = olhar(10)
conferir("OBS enviando ha 10 s: 'conferindo'", t["no_ar"] is True and t["recepcao"]["caso"] == "aguardando")
t = olhar(60)
conferir("YouTube recebendo: ok", t["recepcao"]["caso"] == "ok" and t["recepcao"]["canal"] == "Canal de mentira", t["recepcao"])

YT.cenario = "nao_iniciada"
t = olhar(60)
conferir("transmissao nao iniciada: alerta com o botao", t["recepcao"]["caso"] == "nao_iniciada" and t["recepcao"]["acoes"] == ["iniciar"], t["recepcao"])
conferir("e vai para o 'Aconteceu agora'", ponte._historico[0]["titulo"] == "Chegando no YouTube, mas a transmissão não foi iniciada" and ponte._historico[0]["ok"] is False)
conferir("pela web, nenhuma das tres acoes", all(acao({"tipo": x}, "web")[1] == 403 for x in ("yt_iniciar", "yt_usar_chave", "yt_reconectar")))
corpo, codigo = acao({"tipo": "yt_iniciar"})
conferir("'Iniciar no YouTube' com um toque", codigo == 200 and ("iniciar", "video-simulado") in YT.pedidos, corpo)
conferir("fica anotado como acao de alguem", ponte._historico[0]["titulo"] == "Transmissão iniciada no YouTube")
conferir("e o painel volta a ok", olhar(60)["recepcao"]["caso"] == "ok")

OBS.chave = "chave-de-mentira-antiga"
t = olhar(60)
conferir("chave antiga no OBS: 'A chave do OBS é de outra transmissão'",
         t["recepcao"]["caso"] == "outra_chave" and t["recepcao"]["acoes"] == ["usar_chave", "reconectar"], t["recepcao"])
corpo, codigo = acao({"tipo": "yt_usar_chave"})
conferir("'Usar a chave desta transmissão' grava a chave certa no OBS", codigo == 200 and OBS.chave == "chave-de-mentira-de-hoje", corpo)
conferir("e diz que falta reconectar", "Reconectar" in corpo["detalhe"])
conferir("a chave nao aparece na resposta nem no historico", "chave-de-mentira" not in json.dumps(corpo) + json.dumps(list(ponte._historico)))
conferir("a chave anterior fica guardada fora do Git, para voltar atras", os.path.exists(os.path.join(PASTA, "_obs_stream_anterior.json")))

YT.cenario = "nao_recebe"
t = olhar(60)
conferir("envio que nao chega: 'O YouTube não está recebendo'", t["recepcao"]["caso"] == "nao_recebe" and t["recepcao"]["acoes"] == ["reconectar"])
YT.cenario = "ok"
antes = OBS.transmitindo_desde
corpo, codigo = acao({"tipo": "yt_reconectar"})
tipos = [p[0] for p in OBS.pedidos]
conferir("'Reconectar o OBS' para e comeca o envio de novo", codigo == 200 and "StopStream" in tipos and tipos.index("StopStream") < len(tipos) - 1 - tipos[::-1].index("StartStream")
         and OBS.transmitindo_desde is not None and OBS.transmitindo_desde != antes, corpo)
conferir("a gravacao nao e tocada", "StopRecord" not in tipos and "StartRecord" not in tipos)
conferir("acao desconhecida continua recusada", acao({"tipo": "yt_apagar"})[1] == 400)
sem_obs = ponte._contexto["obs"]
ponte._contexto["obs"] = None
conferir("sem OBS neste PC, trocar chave e reconectar sao recusados", acao({"tipo": "yt_reconectar"})[1] == 400 and acao({"tipo": "yt_usar_chave"})[1] == 400)
ponte._contexto["obs"] = sem_obs
resposta = cliente.post("/api/recepcao/simular", json={"caso": "outra_chave"})
conferir("a rota de faz de conta so existe na simulacao", resposta.status_code == 200 and ponte.SIMULAR is True)

print("\nSem YouTube neste PC, nada muda")
ponte._recepcao["valor"] = None
t = cliente.get("/api/painel").get_json()["transmissao"]
conferir("o painel segue confiando no OBS, como antes", t["recepcao"] is None and t["no_ar"] is True)
conferir("e as acoes dizem por que nao", acao({"tipo": "yt_iniciar"})[1] == 400)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
