"""Testes do roteiro intercalado, do VS e do celular do musico. Rodam sem
Holyrics, sem Reaper, sem audio e sem internet:

    python _testar_musico.py

O roteiro vem de roteiro.exemplo.json, que esta no formato que o ChurchManager
vai mandar (campo `roteiro`, com momentos e musicas na ordem). O que NAO da
para testar aqui: o Reaper de verdade e o VS saindo no som.
"""

import json
import os
import sys
import tempfile
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

PASTA = tempfile.mkdtemp()
os.environ["PONTE_SIMULAR"] = "1"
os.environ["PONTE_CONFIG"] = os.path.join(AQUI, "config.exemplo.yaml")
os.environ.setdefault("PONTE_SENHA", "senha-de-teste")
os.environ.setdefault("PONTE_CHAVE", "chave-de-teste-com-mais-de-24-letras")
os.environ["PONTE_DADOS"] = PASTA
os.environ["PONTE_HTTP"] = "1"

from ponte import musico as mod_musico   # noqa: E402
from ponte import repertorio, roteiro as mod_roteiro, vs as mod_vs, vs_reaper   # noqa: E402
from ponte.condutor import Condutor   # noqa: E402
from ponte.relogio import Relogio   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


with open(os.path.join(AQUI, "roteiro.exemplo.json"), encoding="utf-8") as arquivo:
    EXEMPLO = json.load(arquivo)
TABELA = repertorio.tabela_de_climas({}, ["louvor", "celebracao", "oracao"], ["respiro", "lento", "onda", "animado", "batida"])
CUES = {"abertura": {"nome": "Abertura"}, "louvor": {"nome": "Louvor"}, "avisos": {"nome": "Avisos"},
        "ofertorio": {"nome": "Ofertório"}, "pregacao": {"nome": "Pregação"}, "encerrar": {"nome": "Encerrar"}}

print("\nO roteiro do ChurchManager")
itens = mod_roteiro.normalizar(EXEMPLO["roteiro"])
conferir("momentos e musicas na ordem", [(i["tipo"][:3], i["nome"]) for i in itens][:5] == [
    ("mom", "Abertura"), ("mus", "Nada nos separa"), ("mom", "Oração"), ("mus", "Rio de paz"), ("mom", "Avisos")], itens[:2])
conferir("a musica traz tom, bpm e as partes com tempo", itens[3]["musica"]["tom"] == "D" and itens[3]["musica"]["bpm"] == 68
         and itens[3]["musica"]["partes"][1] == {"nome": "Refrão", "inicio": 20.0, "fim": 40.0}, itens[3]["musica"]["partes"][1])
conferir("hora e duracao de cada item", (itens[2]["inicio"], itens[2]["duracao_min"]) == ("19:09", 3))
conferir("fora de ordem, vale o campo `ordem`", [i["nome"] for i in mod_roteiro.normalizar(list(reversed(EXEMPLO["roteiro"])))][0] == "Abertura")
conferir("sem o campo: None (a Ponte segue como hoje)", mod_roteiro.normalizar(None) is None and mod_roteiro.normalizar([]) is None)
conferir("lixo e musica sem dados ficam de fora", mod_roteiro.normalizar(["x", {"tipo": "musica", "id": "1"}, {"tipo": "momento", "nome": "A"}])[0]["nome"] == "A"
         and len(mod_roteiro.normalizar(["x", {"tipo": "musica", "id": "1"}, {"tipo": "momento", "nome": "A"}])) == 1)
conferir("data completa vira hora local, sem estourar", mod_roteiro._hora("2026-11-22T19:05:00") == "19:05" and mod_roteiro._hora("xx") is None)

print("\nQue momento do config cada item aciona")
conferir("pelo nome", mod_roteiro.achar_cue(itens[4], CUES) == "avisos" and mod_roteiro.achar_cue(itens[5], CUES) == "ofertorio")
conferir("a palavra, pelo tipo", mod_roteiro.achar_cue(itens[7], CUES, None, ["pregacao"], ["louvor"]) == "pregacao")
conferir("sem par: nao aciona nada", mod_roteiro.achar_cue(itens[2], CUES) is None)
conferir("o config pode dizer o par", mod_roteiro.achar_cue(itens[8], CUES, {"Encerramento": "encerrar"}) == "encerrar")
conferir("par que aponta para momento que nao existe e ignorado", mod_roteiro.achar_cue(itens[2], CUES, {"Oração": "nao_existe"}) is None)

print("\nO roteiro montado aqui (sem o ChurchManager)")
local = mod_roteiro.do_local([{"id": "abertura", "nome": "Abertura"}, {"id": "louvor", "nome": "Louvor"}, {"id": "avisos", "nome": "Avisos"}],
                             [{"id": "a", "titulo": "A", "tom": "G", "bpm": 70.0}, {"id": "b", "titulo": "B"}], ["louvor"])
conferir("as musicas entram depois do momento do louvor",
         [i["nome"] for i in local] == ["Abertura", "Louvor", "A", "B", "Avisos"], [i["nome"] for i in local])
conferir("e cada momento ja sabe a sua cue", mod_roteiro.achar_cue(local[4], CUES) == "avisos" and local[2]["musica"]["tom"] == "G")

print("\nO ponteiro do roteiro")


class Tempo:
    def __init__(self, t=None):
        hoje = time.localtime()
        self.t = t if t is not None else time.mktime((hoje.tm_year, hoje.tm_mon, hoje.tm_mday, 19, 9, 0, 0, 0, -1))

    def __call__(self):
        return self.t


tempo = Tempo()
r = mod_roteiro.Roteiro(agora=tempo)
conferir("carregar", r.carregar(itens, "cultos", "v1") and r.atual() is None and r.origem == "cultos")
conferir("a mesma versao nao recarrega", r.carregar(itens, "cultos", "v1") is False)
r.ir(2)
conferir("ir move o ponteiro", r.atual() == 2 and r.item()["nome"] == "Oração")
conferir("vizinhos", r.vizinho(1) == 3 and r.vizinho(-1) == 1)
conferir("a proxima MUSICA pula os momentos do meio", (r.ir(4), r.vizinho(1, so_musica=True))[1] == 6)
conferir("achar a musica pelo id", r.achar("musica", "m2") == 3)
r.ir(2)
tempo.t += 80
ret = r.retrato()
conferir("o retrato traz hora, quanto falta e o atraso",
         ret["itens"][2]["hora"] == "19:09" and ret["itens"][2]["resta_s"] == 100 and ret["texto"] == "No horário", (ret["itens"][2], ret["texto"]))
conferir("musica mostra o tom", ret["itens"][3]["tom"] == "D" and ret["itens"][3]["tipo"] == "musica")
conferir("indice fora da fila e recusado", r.ir(99) is None and r.ir("x") is None and r.atual() == 2)
novo = [dict(i) for i in itens]
novo.insert(0, {"tipo": "momento", "id": "pre", "nome": "Pré-culto", "inicio": "18:45", "duracao_min": 15, "momento": None, "cue": None, "musica": None})
r.carregar(novo, "cultos", "v2")
conferir("o roteiro mudou no meio do culto: o lugar e mantido", r.item()["nome"] == "Oração" and r.atual() == 3)

print("\nO VS: o interruptor")
rel = Relogio("navegador", agora=lambda: 100.0)
desligado = mod_vs.Transporte({}, rel)
conferir("de fabrica vem desligado", desligado.ativo is False and desligado.driver == "nenhum")
desligado.tocar("m2", 0, "Rio de paz")
conferir("desligado, nenhum pedido e publicado", desligado.pedido("PC do som") is None and desligado.retrato()["ativo"] is False)
conferir("e nao da para mexer no audio", desligado.pode_posicionar() is False)
conferir("driver sem `ativo: true` continua desligado", mod_vs.Transporte({"driver": "reaper"}, rel).ativo is False)
conferir("driver desconhecido vira nenhum", mod_vs.Transporte({"ativo": True, "driver": "fita"}, rel).ativo is False)
agora = [200.0]
ligado = mod_vs.Transporte({"ativo": True, "driver": "reaper"}, rel, agora=lambda: agora[0])
conferir("ligado, sem pedido ainda", ligado.pedido() is None and ligado.pode_posicionar())
ligado.tocar("m2", 0, "Rio de paz")
ligado.ir_para("m2", 60.0, "Rio de paz")
p = ligado.pedido("PC do som")
conferir("o pedido e numerado, e vale o ultimo", (p["n"], p["acao"], p["musica"], p["posicao"]) == (2, "ir", "m2", 60.0), p)
conferir("o painel sabe quem esta obedecendo", ligado.retrato()["alguem_obedece"] and ligado.retrato()["quem"] == "PC do som")
agora[0] += 10
conferir("e percebe quando ninguem busca mais", ligado.retrato()["alguem_obedece"] is False)
ligado.parar()
conferir("parar tambem e um pedido", ligado.pedido()["acao"] == "parar")
cron = Relogio("cronometro", agora=lambda: 100.0)
conferir("com o cronometro, o proprio relogio obedece", mod_vs.Transporte({}, cron).pode_posicionar()
         and (mod_vs.Transporte({}, cron).ir_para("m2", 42.0), cron.ler()["posicao"])[1] == 42.0)

print("\nO lado do PC do som (Reaper de mentira)")
conferir("ler o transporte", vs_reaper.ler_transporte("TRANSPORT\t1\t83.250000\t0\t1:23.250\t42.1.00\n") == (True, 83.25)
         and vs_reaper.ler_transporte("TRANSPORT\t0\t5.0\t0\t\t\n") == (False, 5.0) and vs_reaper.ler_transporte("lixo") is None)
REGIOES = "REGION_LIST\nREGION\tNada nos separa\t1\t10.0\t70.0\t0\nREGION\t02 - Rio de Paz (D)\t2\t100.0\t250.0\t0\nREGION_LIST_END\n"
regioes = vs_reaper.ler_regioes(REGIOES)
conferir("ler as regioes", [(x["nome"], x["inicio"]) for x in regioes] == [("Nada nos separa", 10.0), ("02 - Rio de Paz (D)", 100.0)])
conferir("achar a regiao pelo titulo, mesmo com enfeite no nome", vs_reaper.achar_regiao(regioes, "m2", "Rio de paz")["inicio"] == 100.0)
conferir("ou pelo nome escrito no config", vs_reaper.achar_regiao(regioes, "m9", "Outra", {"m9": "Nada nos separa"})["inicio"] == 10.0)
conferir("sem regiao: None", vs_reaper.achar_regiao(regioes, "m3", "Tudo o que tenho") is None)


class Mundinho:
    """A principal e o Reaper, de mentira."""

    def __init__(self):
        self.pedido = None
        self.reaper = []
        self.posicao = 0.0
        self.tocando = False
        self.avisos = []

    def buscar(self, url, corpo=None):
        if "/api/vs/pedido" in url:
            return json.dumps({"pedido": self.pedido})
        if url.endswith("/api/relogio"):
            self.avisos.append(corpo)
            return "{}"
        comando = url.split("/_/", 1)[1]
        self.reaper.append(comando)
        if comando == "REGION":
            return REGIOES
        if comando.startswith("SET/POS/"):
            self.posicao = float(comando.rsplit("/", 1)[1])
        if comando == "1007":
            self.tocando = True
        if comando == "1016":
            self.tocando = False
        if comando == "TRANSPORT":
            return "TRANSPORT\t{}\t{}\t0\t\t\n".format(1 if self.tocando else 0, self.posicao)
        return ""


mu = Mundinho()
agente = vs_reaper.AgenteDoReaper("http://principal:8700", {"porta": 8080}, buscar=mu.buscar)
agente.passo()
conferir("sem pedido, nao toca no Reaper", mu.reaper == [] and agente.erro is None)
mu.pedido = {"n": 1, "acao": "tocar", "musica": "m2", "titulo": "Rio de paz", "posicao": 0.0}
agente.passo()
conferir("tocar: vai ao comeco da regiao da musica e da play", "SET/POS/100.000" in mu.reaper and "1007" in mu.reaper and mu.tocando, mu.reaper)
conferir("e avisa a principal em que segundo a MUSICA esta", mu.avisos[-1] == {"fonte": "reaper", "musica": "m2", "posicao": 0.0, "tocando": True}, mu.avisos[-1])
antes = len(mu.reaper)
agente.passo()
conferir("o mesmo pedido nao e obedecido duas vezes", [c for c in mu.reaper[antes:] if c != "TRANSPORT"] == [])
mu.pedido = {"n": 2, "acao": "ir", "musica": "m2", "titulo": "Rio de paz", "posicao": 60.0}
agente.passo()
conferir("pular: posicao da musica + inicio da regiao", mu.posicao == 160.0 and mu.avisos[-1]["posicao"] == 60.0, mu.posicao)
mu.pedido = {"n": 3, "acao": "tocar", "musica": "m3", "titulo": "Tudo o que tenho", "posicao": 0.0}
agente.passo()
conferir("musica sem regiao no Reaper: avisa o erro e nao mexe", "não achei no Reaper" in (agente.erro or "") and mu.posicao == 160.0, agente.erro)
mu.pedido = {"n": 4, "acao": "parar", "musica": None, "posicao": 0.0}
agente.passo()
conferir("parar", mu.tocando is False and mu.reaper[-1] == "1016")

# ---------------------------------------------------------------------------
print("\nO celular do musico: a tela")


class Banda:
    """Um culto de mentira: condutor de verdade, telao e luz de mentira."""

    def __init__(self, fonte="cronometro", vs=None):
        self.t = Tempo().t
        self.telao = []
        self.notas = []
        self.entradas = []
        self.musicas = [repertorio.musica_do_cultos(s, TABELA) for s in EXEMPLO["songs"]]
        self.relogio = Relogio(fonte, agora=lambda: self.t)
        self.condutor = Condutor(self.relogio, lambda: self.musicas, lambda m: None,
                                 lambda m, s: self.telao.append(s["indice"]), lambda p: None,
                                 lambda *a: None, agora=lambda: self.t)
        self.roteiro = mod_roteiro.Roteiro(agora=lambda: self.t)
        self.roteiro.carregar(mod_roteiro.normalizar(EXEMPLO["roteiro"]), "cultos", "v1")
        self.vs = mod_vs.Transporte(vs or {}, self.relogio, agora=lambda: self.t)
        self.m = mod_musico.Musico(self.condutor, self.roteiro, self.vs, self.relogio, lambda: self.musicas,
                                   self.entrar, lambda titulo, ok, detalhe: self.notas.append(titulo),
                                   no_ar=lambda: True, agora=lambda: self.t)

    def entrar(self, indice, quem, soltar_vs):
        item = self.roteiro.ir(indice)
        self.entradas.append((item["nome"], soltar_vs))
        if item["tipo"] == "musica":
            self.condutor.ir_musica(item["id"])
            if soltar_vs:
                self.vs.tocar(item["id"], 0.0, item["nome"])
        else:
            if self.condutor.tem_musica():
                self.condutor.encerrar()
                self.vs.parar()
        return {"ok": True}, 200

    def andar(self, segundos):
        passos = max(1, int(segundos / 0.05))
        for _ in range(passos):
            self.t += segundos / passos
            self.condutor.passo()
            self.m.passo()

    def toque(self, acao, **dados):
        return self.m.agir(acao, dados)


b = Banda()
t = b.m.tela()
conferir("antes de o culto comecar: 'Proximo' leva ao primeiro item", t["modo"] == "vazio" and t["proximo"] == {"rotulo": "Abertura", "pode": True}, t["proximo"])
b.toque("proximo")
conferir("o primeiro toque entra no primeiro item", b.roteiro.item()["nome"] == "Abertura")
b.entrar(2, "teste", False)      # a primeira musica ja foi; o culto esta na Oracao
b.andar(80)
t = b.m.tela()
conferir("entre musicas: o momento, com o tempo", t["modo"] == "momento" and t["momento"] == {"nome": "Oração", "de_min": 3, "passou_s": 80}, t["momento"])
conferir("'Preparem' com a proxima musica, o tom e a instrucao dos musicos",
         t["preparem"] == {"titulo": "Rio de paz", "tom": "D", "bpm": 68, "instrucao": "Começa só voz e violão."}, t["preparem"])
conferir("'Depois' com os momentos seguintes", t["depois"] == ["Avisos", "Ofertório"], t["depois"])
conferir("Proximo diz para onde vai, e Voltar tambem", t["proximo"] == {"rotulo": "Começar Rio de paz", "pode": True}
         and t["voltar"] == {"rotulo": "Nada nos separa", "pode": True}, (t["proximo"], t["voltar"]))
conferir("Repetir fica desligado fora de musica", t["repetir"] == {"rotulo": "só em música", "pode": False})
conferir("a tela diz que esta ao vivo, e a data", t["no_ar"] is True and "/" in t["data"])
corpo, codigo = b.toque("repetir")
conferir("repetir fora de musica e recusado", codigo == 409)

print("\nComecar a musica solta o VS")
b.toque("proximo")
conferir("'Proximo' para dentro de uma musica comeca a musica", b.entradas[-1] == ("Rio de paz", True) and b.relogio.ler()["posicao"] == 0.0)
b.andar(62)
t = b.m.tela()
conferir("na musica: titulo, tom e bpm", t["modo"] == "musica" and t["musica"] == {"id": "m2", "titulo": "Rio de paz", "tom": "D", "bpm": 68, "a_mao": False})
conferir("as partes em lista, com a atual marcada",
         [(p["nome"], p["estado"]) for p in t["partes"]] == [("Verso 1", "ja_foi"), ("Refrão", "ja_foi"), ("Verso 2", "ja_foi"), ("Refrão", "agora"),
                                                             ("Ponte", "depois"), ("Refrão", "depois"), ("Final", "depois")], t["partes"])
conferir("a letra do telao dentro da parte de agora", t["letra"] == ["TEU RIO CORRE EM MIM", "E A SEDE VAI EMBORA"], t["letra"])
conferir("as proximas mostram o comeco da letra; a instrumental, a instrucao",
         t["partes"][4]["dica"] == "Leva-me mais fundo…" and t["partes"][6]["dica"] == "Só instrumental", (t["partes"][4]["dica"], t["partes"][6]["dica"]))
conferir("os botoes dizem o que fazem", t["proximo"]["rotulo"] == "Ponte" and t["voltar"]["rotulo"] == "Verso 2" and t["repetir"]["rotulo"] == "o refrão")
conferir("'Proxima musica' pula os momentos do meio", t["proxima_musica"] == {"titulo": "Tudo o que tenho", "tom": "E"}, t["proxima_musica"])
conferir("os botoes estao mexendo no audio", t["pelo_audio"] is True)

print("\nRepetir conversa com o tempo da musica")
corpo, codigo = b.toque("repetir")
conferir("repetir marca, nao pula na hora", codigo == 200 and corpo["titulo"] == "O refrão vai repetir" and abs(b.relogio.ler()["posicao"] - 62) < 0.2, corpo)
t = b.m.tela()
conferir("a lista ganha o refrao a mais, e o Proximo vira 'Refrão de novo'",
         [(p["nome"], p["estado"]) for p in t["partes"]][3:6] == [("Refrão", "agora"), ("Refrão", "repete"), ("Ponte", "depois")]
         and t["proximo"]["rotulo"] == "Refrão de novo" and t["repetir"]["rotulo"] == "mais uma vez", t["proximo"])
conferir("aparece o 'Desfazer'", t["feito"] == {"texto": "O refrão vai repetir"})
conferir("e o operador fica sabendo", b.notas[-1] == "Músico: repetiu o refrão", b.notas[-1])
b.andar(19)
pos = b.relogio.ler()["posicao"]
conferir("no fim do refrao o AUDIO volta ao comeco dele", 60.0 <= pos < 62.5, pos)
conferir("e o telao mostra o refrao de novo, nao a ponte", b.condutor.retrato()["parte"] == 3 and b.telao[-1] == 3, b.telao[-3:])
b.andar(21)
conferir("da segunda vez segue para a ponte", b.condutor.retrato()["parte"] == 4 and b.m.tela()["partes"][4]["estado"] == "agora", b.condutor.retrato()["parte"])

print("\nPular, voltar e desfazer")
corpo, codigo = b.toque("pular", parte=1)
conferir("tocar numa parte leva o audio para o comeco dela", codigo == 200 and abs(b.relogio.ler()["posicao"] - 20.0) < 0.01 and corpo["titulo"] == "Pulou para o refrão", corpo)
b.andar(0.2)
conferir("e a letra vai atras", b.telao[-1] == 1 and b.m.tela()["partes"][1]["estado"] == "agora")
b.toque("proximo")
conferir("Proximo vai para a parte seguinte", abs(b.relogio.ler()["posicao"] - 40.0) < 0.01)
b.toque("voltar")
conferir("Voltar vai para a anterior", abs(b.relogio.ler()["posicao"] - 20.0) < 0.01 and b.notas[-1] == "Músico: voltou para o refrão")
b.andar(5)
b.toque("pular", parte=4)
b.andar(2)
corpo, codigo = b.toque("desfazer")
conferir("desfazer volta para onde o audio ESTARIA sem o toque", codigo == 200 and abs(b.relogio.ler()["posicao"] - 27.0) < 0.3, b.relogio.ler()["posicao"])
conferir("e some da tela", b.m.tela()["feito"] is None and b.notas[-1] == "Músico: desfez (pulou para a ponte)")
conferir("nao da para desfazer duas vezes", b.toque("desfazer")[1] == 409)
b.toque("repetir")
b.toque("repetir")
conferir("repetir duas vezes marca duas", b.m.tela()["feito"]["texto"] == "O refrão vai repetir 2 vezes")
b.toque("desfazer")
conferir("desfazer tira so a ultima", [p["estado"] for p in b.m.tela()["partes"]].count("repete") == 1)
b.toque("pular", parte=0)
conferir("pular para outra parte cancela a repeticao marcada", [p["estado"] for p in b.m.tela()["partes"]].count("repete") == 0)
b.toque("repetir")
b.andar(20)
b.toque("desfazer")
conferir("o 'Desfazer' some sozinho depois de 15 s", b.m.tela()["feito"] is None)
conferir("parte que nao existe e recusada", b.toque("pular", parte=99)[1] == 400 and b.toque("pular", parte="x")[1] == 400)
conferir("acao desconhecida e recusada", b.toque("apagar_tudo")[1] == 400)

print("\nDois celulares")
versao = b.m.tela()["versao"]
a = b.toque("proximo", visto=versao)
c = b.toque("proximo", visto=versao)
conferir("dois toques vendo a mesma tela: so o primeiro vale", a[1] == 200 and c[1] == 409 and c[0]["conflito"], c)

print("\nProxima musica")
b = Banda()
b.entrar(2, "teste", False)
b.toque("proximo")               # da Oracao para dentro de "Rio de paz"
b.andar(30)
corpo, codigo = b.toque("proxima_musica")
conferir("pula os momentos do meio e comeca a musica seguinte", codigo == 200 and b.entradas[-1] == ("Tudo o que tenho", True)
         and corpo["titulo"] == "Começou Tudo o que tenho" and b.roteiro.atual() == 6, (corpo, b.entradas[-1]))
conferir("o relogio da musica nova comeca do zero", b.relogio.ler()["musica"] == "m3" and b.relogio.ler()["posicao"] == 0.0)
conferir("fica anotado com o nome da musica", b.notas[-1] == "Músico: próxima música (Tudo o que tenho)")
b.andar(4)
b.toque("desfazer")
conferir("desfazer volta para a musica anterior, no ponto em que ela estaria",
         b.roteiro.atual() == 3 and b.relogio.ler()["musica"] == "m2" and abs(b.relogio.ler()["posicao"] - 34.0) < 0.5, b.relogio.ler())
b.toque("proxima_musica")
conferir("na ultima musica, o botao some e o pedido e recusado", b.m.tela()["proxima_musica"] is None and b.toque("proxima_musica")[1] == 409)
b.toque("proximo")
t = b.m.tela()
b.toque("proximo")
conferir("no fim da musica, Proximo leva ao momento seguinte e para o VS",
         b.roteiro.item()["nome"] == "Palavra" and b.condutor.tem_musica() is False and b.relogio.ler()["posicao"] is None, b.roteiro.item()["nome"])

print("\nSem como mexer no audio (VS desligado, tempo vindo de fora)")
b = Banda(fonte="navegador")
b.entrar(2, "teste", False)
b.toque("proximo")               # da Oracao para dentro de "Rio de paz"
b.relogio.avisar("navegador", "m2", 62.0, True)
b.condutor.passo()
t = b.m.tela()
conferir("a tela avisa que os botoes so passam a letra", t["pelo_audio"] is False and t["modo"] == "musica")
b.toque("pular", parte=4)
conferir("pular passa a LETRA para a parte, a mao", b.telao[-1] == 4 and b.condutor.retrato()["letra"] == "na_mao" and b.condutor.retrato()["quem"] == "Músico")
conferir("e nenhum pedido de VS e publicado", b.vs.pedido() is None)
corpo, codigo = b.toque("repetir")
conferir("repetir volta a letra ao comeco da parte, na hora", corpo["titulo"] == "A ponte voltou ao começo" and b.telao[-1] == 4, corpo)

print("\nCom o VS ligado")
b = Banda(fonte="reaper", vs={"ativo": True, "driver": "reaper"})
b.entrar(2, "teste", False)
b.toque("proximo")               # da Oracao para dentro de "Rio de paz"
conferir("comecar a musica publica o pedido de tocar", b.vs.pedido("PC do som")["acao"] == "tocar" and b.vs.pedido()["musica"] == "m2")
b.relogio.avisar("reaper", "m2", 25.0, True)
b.toque("pular", parte=4)
p = b.vs.pedido()
conferir("pular publica o pedido de ir para o comeco da parte", (p["acao"], p["posicao"], p["titulo"]) == ("ir", 80.0, "Rio de paz"), p)
conferir("e a letra NAO e passada a mao: ela segue o audio", b.condutor.retrato()["letra"] == "sozinho")

print("\nO link")
tl = Tempo(1000.0)
link = mod_musico.Link(agora=tl)
conferir("sem link: nada confere", link.confere("x") is False and link.retrato() is None and link.codigo() is None)
codigo_1 = link.gerar()
conferir("o retrato leva so o resumo do codigo", link.confere(codigo_1) and codigo_1 not in json.dumps(link.retrato()) and len(link.retrato()["resumo"]) == 64)
codigo_2 = link.gerar()
conferir("um link novo mata o anterior", link.confere(codigo_2) and not link.confere(codigo_1))
tl.t += 6 * 3600 + 1
conferir("morre em 6 horas", not link.confere(codigo_2))
link.gerar()
link.encerrar()
conferir("e quando o operador encerra", link.codigo() is None)

# ---------------------------------------------------------------------------
print("\nNo painel, com o roteiro vindo do ChurchManager")
repertorio.FonteCultos._pela_rede = lambda self: EXEMPLO
repertorio.FonteCultos.comecar = lambda self: self.atualizar()
import app as ponte   # noqa: E402
from ponte import simulados   # noqa: E402

ponte.CAMINHO_PONTEIRO = os.path.join(PASTA, "_ordem_atual.json")
ponte.CAMINHO_LOUVOR = os.path.join(PASTA, "_louvor_atual.json")
ponte.CAMINHO_MARCAS = os.path.join(PASTA, "_marcas_louvor.json")
ponte.CAMINHO_PALAVRA = os.path.join(PASTA, "_palavra_do_dia.json")
ponte.RAIZ_DO_CULTO = PASTA
ponte._config = ponte.carregar_config()
ponte._config["repertorio"] = {"fonte": "cultos"}
ponte._config["cultos"] = {"url": "http://127.0.0.1:9", "slug": "exemplo", "chave": "chave-de-mentira"}
ponte._config["relogio"] = {"fonte": "cronometro"}
ponte._contexto = ponte.montar_contexto(ponte._config)
HOLY = simulados.HolyricsSimulado()
ponte._contexto["obs"] = ponte._contexto["obs_saude"] = simulados.ObsSimulado()
ponte._contexto["holyrics"] = ponte._contexto["holyrics_saude"] = HOLY
ponte._cues_por_id = ponte.indexar_cues(ponte._config)
ponte._ordens_por_id = ponte.indexar_ordens(ponte._config)
ponte._retomar_ordem(ponte._config)
ponte._estado["obs"] = ponte._ler_estado_obs()
ponte._ao_vivo["valor"] = ponte._montar_ao_vivo()
cliente = ponte.app.test_client()


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


d = cliente.get("/api/painel").get_json()
conferir("o retrato traz o roteiro, com musicas intercaladas",
         d["roteiro"]["origem"] == "cultos" and [i["tipo"] for i in d["roteiro"]["itens"]][:4] == ["momento", "musica", "momento", "musica"], d["roteiro"]["itens"][:2])
conferir("as chaves antigas do retrato continuam la", {"ordem", "sistemas", "transmissao", "telao", "luz", "historico", "louvor", "agenda"} <= set(d))
conferir("sem link, a tela do musico nao viaja", d["musico"] == {"link": None, "tela": None} and d["vs"]["ativo"] is False)
corpo, codigo = acao({"tipo": "roteiro_ir", "indice": 0})
conferir("ir a um momento do roteiro aciona o momento do config", codigo == 200 and ponte._ordem["momentos"][ponte._ordem["atual"]] == "abertura", corpo)
corpo, codigo = acao({"tipo": "roteiro_ir", "indice": 1})
d = cliente.get("/api/painel").get_json()
conferir("ir a uma musica entra no louvor e poe a letra no telao",
         codigo == 200 and ponte._ordem["momentos"][ponte._ordem["atual"]] == "louvor" and d["louvor"]["musica"]["id"] == "m1"
         and HOLY.musica == "9111" and d["roteiro"]["atual"] == 1, (corpo, HOLY.musica))
conferir("o operador escolher a musica NAO solta o VS", ponte._pecas["relogio"].ler()["posicao"] is None)
acao({"tipo": "roteiro_ir", "indice": 2})
d = cliente.get("/api/painel").get_json()
conferir("momento sem par no config: o roteiro anda e a musica e encerrada",
         d["roteiro"]["atual"] == 2 and d["louvor"]["musica"] is None and ponte._ordem["momentos"][ponte._ordem["atual"]] == "louvor")
acao({"tipo": "louvor_musica", "para": "m2"})
conferir("o operador troca de musica pelo painel: o roteiro acompanha", cliente.get("/api/painel").get_json()["roteiro"]["atual"] == 3)
acao({"tipo": "ir", "momento": "avisos"})
conferir("e troca de momento pela ordem antiga: o roteiro acompanha", cliente.get("/api/painel").get_json()["roteiro"]["atual"] == 4)
conferir("item que nao existe e recusado", acao({"tipo": "roteiro_ir", "indice": 99})[1] == 404 and acao({"tipo": "roteiro_ir", "indice": "x"})[1] == 400)
conferir("pela web, ir a um item do roteiro e aceito (como o 'ir')", acao({"tipo": "roteiro_ir", "indice": 2}, "web")[1] == 200)
conferir("pela web, criar o link do musico e recusado", acao({"tipo": "musico_link", "acao": "gerar"}, "web")[1] == 403)

print("\nO celular do musico pelo Wi-Fi")
conferir("sem link, a pagina nao abre", cliente.get("/musico/abc").status_code == 404 and cliente.get("/api/musico/abc").status_code == 404
         and cliente.get("/api/painel/musico").get_json() == {"ativo": False})
acao({"tipo": "musico_link", "acao": "gerar"})
enderecos = cliente.get("/api/painel/musico").get_json()
CODIGO = enderecos["local"].rsplit("/", 1)[1]
conferir("o operador gera o link no painel", enderecos["ativo"] and "/musico/" in enderecos["local"])
conferir("o codigo NAO vai no retrato que viaja para a web", CODIGO not in json.dumps(cliente.get("/api/painel").get_json()))
pagina = cliente.get("/musico/" + CODIGO)
conferir("a pagina abre, sem senha", pagina.status_code == 200 and "Próximo".encode() in pagina.data)
pagina.close()
tela = cliente.get("/api/musico/" + CODIGO).get_json()
conferir("entre musicas: o momento e o 'Preparem'", tela["modo"] == "momento" and tela["momento"]["nome"] == "Oração"
         and tela["preparem"]["titulo"] == "Rio de paz" and tela["proximo"]["rotulo"] == "Começar Rio de paz", tela.get("preparem"))
antes = len(ponte._historico)
resposta = cliente.post("/api/musico/" + CODIGO, json={"acao": "proximo", "visto": tela["versao"]})
conferir("Proximo comeca a musica: letra no telao e tempo contando", resposta.status_code == 200 and HOLY.musica == "9222"
         and ponte._pecas["relogio"].ler()["musica"] == "m2" and ponte._pecas["relogio"].ler()["tocando"], resposta.get_json())
conferir("o operador ve o que o musico fez, com a origem", ponte._historico[0]["titulo"] == "Músico: foi para Rio de paz"
         and ponte._historico[0]["origem"] == "músico" and ponte._historico[0]["hora"], ponte._historico[0])
ponte._pecas["relogio"].posicionar("m2", 62.0, True)
ponte._pecas["condutor"].passo()
tela = cliente.get("/api/musico/" + CODIGO).get_json()
conferir("na musica: as partes e a letra", tela["modo"] == "musica" and tela["partes"][3]["estado"] == "agora" and tela["letra"][0] == "TEU RIO CORRE EM MIM")
cliente.post("/api/musico/" + CODIGO, json={"acao": "repetir"})
conferir("repetir aparece para o operador", ponte._historico[0]["titulo"] == "Músico: repetiu o refrão")
cliente.post("/api/musico/" + CODIGO, json={"acao": "pular", "parte": 4})
ponte._pecas["condutor"].passo()
conferir("pular leva a letra do telao para a parte", abs(ponte._pecas["relogio"].ler()["posicao"] - 80.0) < 0.5 and HOLY.slide == 4, HOLY.slide)
conferir("acao que o celular nao tem e recusada", cliente.post("/api/musico/" + CODIGO, json={"acao": "roteiro_ir"}).status_code == 400)
conferir("codigo errado nao faz nada", cliente.post("/api/musico/errado", json={"acao": "proximo"}).status_code == 404)
conferir("o VS desligado nao publica pedido", cliente.get("/api/vs/pedido?quem=teste").get_json() == {"pedido": None, "ativo": False, "driver": "nenhum"})
for nome in ("musico.html",):
    conferir("'{}' esta no pacote e existe".format(nome), nome in ponte.PACOTE and os.path.exists(os.path.join(AQUI, nome)))

print("\nO celular do musico pela internet (versao web)")
import importlib.util   # noqa: E402

espec = importlib.util.spec_from_file_location("ponte_web", os.path.join(AQUI, "..", "web", "app.py"))
web = importlib.util.module_from_spec(espec)
espec.loader.exec_module(web)
celular = web.app.test_client()
CHAVE = {"X-Ponte-Chave": os.environ["PONTE_CHAVE"]}


def igreja_liga():
    return celular.post("/api/espelho", headers=CHAVE, json={
        "chegada": {"passos": []}, "painel": cliente.get("/api/painel").get_json()}).get_json()


conferir("antes de a igreja ligar, nenhum codigo vale", celular.get("/api/musico/" + CODIGO).status_code == 404)
web._tentativas.clear()
igreja_liga()
pagina = celular.get("/musico/" + CODIGO)
conferir("a web abre a pagina do musico SEM a senha da equipe", pagina.status_code == 200)
pagina.close()
conferir("mas o painel continua pedindo senha", celular.get("/painel").status_code == 302)
tela = celular.get("/api/musico/" + CODIGO).get_json()
conferir("o celular recebe a tela pela web", tela["modo"] == "musica" and tela["musica"]["titulo"] == "Rio de paz" and tela["local"] is False, tela.get("modo"))
conferir("o link do pregador nao abre a pagina do musico, nem o contrario", celular.get("/api/pregador/" + CODIGO).status_code == 404)
web._tentativas.clear()
resposta = celular.post("/api/musico/" + CODIGO, json={"acao": "pular", "parte": 1})
conferir("o toque entra na fila", resposta.get_json() == {"ok": True, "enviado": True})
conferir("a web recusa o que o celular nao faz", celular.post("/api/musico/" + CODIGO, json={"acao": "transmitir"}).status_code == 400)
comecou = time.time()
pedidos = celular.post("/api/espelho/pedidos", headers=CHAVE).get_json()
conferir("a igreja, pendurada, recebe o toque na hora", time.time() - comecou < 1 and pedidos["comandos"] == [
    {"tipo": "musico", "passo": None, "corpo": {"codigo": CODIGO, "acao": "pular", "parte": 1, "visto": None}}], pedidos)
for comando in pedidos["comandos"]:
    ponte._pedido_da_web(comando)
conferir("e ele chega: o tempo da musica vai para o refrao", abs(ponte._pecas["relogio"].ler()["posicao"] - 20.0) < 0.5, ponte._pecas["relogio"].ler())
ponte._pedido_da_web({"tipo": "musico", "corpo": {"codigo": "errado", "acao": "proxima_musica"}})
conferir("pedido da web com codigo errado e ignorado", ponte._pecas["roteiro"].atual() == 3)
conferir("a web aceita pedir 'ir a um item do roteiro' pelo painel", "roteiro_ir" in web.ACOES_DO_PAINEL and "musico_link" not in web.ACOES_DO_PAINEL)
acao({"tipo": "musico_link", "acao": "encerrar"})
igreja_liga()
conferir("encerrado na igreja, o link morre na web tambem", celular.get("/api/musico/" + CODIGO).status_code == 404)
acao({"tipo": "musico_link", "acao": "gerar"})
novo = cliente.get("/api/painel/musico").get_json()["local"].rsplit("/", 1)[1]
acao({"tipo": "ordem", "id": "quinta"})
conferir("trocar a ordem do culto mata o link", ponte._pecas["musico"].link.confere(novo) is False)

print("\nSem o roteiro do ChurchManager, a Ponte segue como hoje")
sem = dict(EXEMPLO)
del sem["roteiro"]
ponte._pecas["repertorio"]._buscar = lambda: sem
ponte._pecas["repertorio"].atualizar()
acao({"tipo": "ordem", "id": "domingo_manha"})
d = cliente.get("/api/painel").get_json()
conferir("o painel do operador volta a mostrar a ordem do culto", d["roteiro"] is None and len(d["ordem"]["momentos"]) == 7)
conferir("e o celular do musico usa a fila montada aqui", [i["nome"] for i in ponte._pecas["roteiro"].itens()][:5] == [
    "Pré-culto", "Abertura", "Louvor", "Nada nos separa", "Rio de paz"], [i["nome"] for i in ponte._pecas["roteiro"].itens()][:5])

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
