"""Testes do condutor do louvor. Rodam sem Holyrics, sem luz e sem audio:

    python _testar_condutor.py

O telao e a luz sao listas que o teste le depois; o relogio e do teste.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import repertorio
from ponte.condutor import Condutor
from ponte.relogio import Relogio

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


TABELA = repertorio.tabela_de_climas({}, ["louvor", "celebracao", "oracao"],
                                     ["respiro", "lento", "onda", "animado", "batida"])
SLIDES = [{"text": "S{}".format(i)} for i in range(8)]
# Verso 1: slides 0,1 (0 s e 5 s) · Refrao: 2,3 (10, 15) · Verso 2: 4,5 (20, 25)
# Refrao final: 2,3 de novo... nao: 6,7 (30, 35). Duracao 40.
MARCAS = [{"nome": "Verso 1", "segundo": 0, "cena": "louvor", "modo": "lento", "slide": 0},
          {"nome": "Refrão", "segundo": 10, "cena": "celebracao", "modo": "animado", "slide": 2},
          {"nome": "Verso 2", "segundo": 20, "cena": "louvor", "modo": "lento", "slide": 4},
          {"nome": "Refrão final", "segundo": 30, "cena": "celebracao", "modo": "batida", "slide": 6}]


def musicas():
    pronta = repertorio.montar_musica({"id": "luz", "nome": "Luz da Manhã", "holyrics_id": "1"},
                                      MARCAS, SLIDES, TABELA, duracao=40)
    outra = repertorio.montar_musica({"id": "rocha", "nome": "Firme Rocha", "holyrics_id": "2"},
                                     [dict(m) for m in MARCAS[:2]], SLIDES[:4], TABELA, duracao=20)
    a_mao = repertorio.montar_musica(
        {"id": "canto", "nome": "Canto Novo", "holyrics_id": "3",
         "secoes": [{"nome": "Verso", "cena": "louvor", "modo": "lento", "slide": 0},
                    {"nome": "Refrão", "cena": "celebracao", "modo": "animado", "slide": 2}]},
        [], SLIDES[:4], TABELA)
    sem_refrao = repertorio.montar_musica({"id": "hino", "nome": "Hino", "holyrics_id": "4"},
                                          [{"nome": "Verso 1", "segundo": 0, "slide": 0}], SLIDES[:2], TABELA)
    return [pronta, outra, a_mao, sem_refrao]


class Mundo:
    def __init__(self, fonte="navegador", lembrado=None):
        self.t = 1000.0
        self.telao = []      # indices do Holyrics postos no telao
        self.mostradas = []  # musicas postas no telao
        self.luz = []        # (cena, modo)
        self.notas = []
        self.holyrics_ok = True
        self.guardado = []
        self.lista = musicas()
        self.relogio = Relogio(fonte, agora=lambda: self.t)
        self.c = Condutor(self.relogio, lambda: self.lista, self._mostrar, self._slide, self._luz,
                          lambda titulo, ok, detalhe: self.notas.append((titulo, ok)),
                          agora=lambda: self.t, lembrado=lembrado, guardar=self.guardado.append)

    def _mostrar(self, musica):
        if not self.holyrics_ok:
            raise RuntimeError("Holyrics fechado")
        self.mostradas.append(musica["id"])

    def _slide(self, musica, slide):
        self.pedidos = getattr(self, "pedidos", 0) + 1
        if not self.holyrics_ok:
            raise RuntimeError("Holyrics fechado")
        self.telao.append(slide["indice"])

    def _luz(self, parte):
        self.luz.append((parte["luz"]["cena"], parte["luz"]["modo"]))

    def tocar(self, posicao, musica="luz", tocando=True):
        self.relogio.avisar("navegador", musica, posicao, tocando)
        self.c.passo()

    def andar(self, segundos, passos=1):
        for _ in range(passos):
            self.t += segundos / passos
            self.c.passo()


print("\nAntes de escolher musica")
m = Mundo()
r = m.c.retrato()
conferir("ha musicas, nenhuma escolhida", r["ativo"] and r["indice"] is None and r["musica"] is None)
conferir("a primeira aparece como 'a seguir'", [i["estado"] for i in r["lista"]] == ["a_seguir", "depois", "depois", "depois"])
conferir("acao sem musica e recusada, sem estourar", m.c.assumir("PC")[1] == 409 and m.c.ir_slide("proximo", None, "PC")[1] == 409)
m.c.passo()
conferir("o condutor parado nao manda nada", m.telao == [] and m.luz == [])

print("\nSozinho: segue o relogio")
m = Mundo()
corpo, codigo = m.c.ir_musica("proxima")
conferir("'Proxima musica' escolhe a primeira", codigo == 200 and corpo["titulo"] == "Música: Luz da Manhã", corpo)
conferir("poe a musica no telao, no primeiro slide", m.mostradas == ["luz"] and m.telao == [0])
r = m.c.retrato()
conferir("nasce sozinha, esperando a musica comecar", r["letra"] == "sozinho" and r["motivo"] == "esperando" and r["luz"] == "seguindo", r["motivo"])
conferir("guarda qual e a musica, para o caso de a ponte reiniciar", m.guardado == ["luz"])
m.tocar(0.5)
conferir("comecou: aplica a luz da primeira parte", m.luz == [("louvor", "lento")], m.luz)
conferir("e nao repete o slide que ja esta no telao", m.telao == [0])
conferir("anota que comecou sozinha", ("Luz da Manhã começou sozinha", True) in m.notas, m.notas)
m.andar(4.0, 40)
conferir("40 voltas no mesmo slide: nenhum pedido a mais", m.telao == [0] and len(m.luz) == 1)
m.tocar(5.2)
conferir("no segundo 5 passa para o slide seguinte", m.telao == [0, 1])
m.tocar(10.1)
conferir("no refrao troca slide e luz", m.telao == [0, 1, 2] and m.luz[-1] == ("celebracao", "animado"), (m.telao, m.luz))
r = m.c.retrato()
conferir("o retrato diz a parte e quanto falta para o proximo slide",
         r["parte"] == 1 and r["proximo_em"] == 4.9 and r["motivo"] is None and r["slide"] == 2, r)
conferir("a segunda musica e a 'a seguir'", [i["estado"] for i in r["lista"]] == ["tocando", "a_seguir", "depois", "depois"])
m.tocar(2.0)
conferir("voltaram a gravacao: a letra volta junto", m.telao[-1] == 0 and m.luz[-1] == ("louvor", "lento"))

print("\nSegurar a letra")
m = Mundo()
m.c.ir_musica("luz")
m.tocar(1.0)
corpo, codigo = m.c.segurar(True, "PC do telão")
conferir("segurar e aceito e anotado com o nome", codigo == 200 and corpo["titulo"] == "PC do telão segurou a letra")
m.tocar(12.0)
conferir("a letra fica parada", m.telao == [0])
conferir("a luz continua seguindo", m.luz[-1] == ("celebracao", "animado"))
conferir("o retrato diz que esta segurando, sem contagem", m.c.retrato()["segurando"] and m.c.retrato()["proximo_em"] is None)
m.c.segurar(False, "PC do telão")
m.c.passo()
conferir("soltar pula para o slide de agora", m.telao == [0, 2], m.telao)
m.c.segurar(True, "PC")
m.c.ir_musica("proxima")
conferir("solta sozinho quando a musica troca", m.c.retrato()["segurando"] is False)

print("\nAssumir e devolver")
m = Mundo()
m.c.ir_musica("luz")
m.tocar(1.0)
corpo, codigo = m.c.assumir("Celular")
conferir("assumir", codigo == 200 and corpo["titulo"] == "Celular assumiu a letra")
m.tocar(12.0)
conferir("na mao, o relogio nao passa mais slide", m.telao == [0])
conferir("mas a luz continua seguindo a musica", m.luz[-1] == ("celebracao", "animado"))
r = m.c.retrato()
conferir("o retrato diz quem assumiu e que da para devolver",
         r["letra"] == "na_mao" and r["quem"] == "Celular" and r["pode_devolver"] and r["motivo"] == "assumido", r)
corpo, codigo = m.c.ir_slide("proximo", 0, "Celular")
conferir("proximo slide na mao", codigo == 200 and m.telao == [0, 1] and corpo["titulo"] == "Letra: slide 2 de 8", corpo)
m.c.ir_slide(5, None, "PC do telão")
conferir("clicar num slide vai direto, e o comando passa a quem tocou", m.telao[-1] == 5 and m.c.retrato()["quem"] == "PC do telão")
corpo, codigo = m.c.devolver("PC do telão")
conferir("devolver pula na hora para o slide de agora", codigo == 200 and m.telao[-1] == 2 and m.c.retrato()["letra"] == "sozinho", m.telao)
m.tocar(15.5)
conferir("e volta a seguir", m.telao[-1] == 3)
conferir("anterior no primeiro slide e recusado", Mundo().c.ir_slide("anterior", None, "x")[1] == 409)
m.c.ir_slide(7, None, "PC")
conferir("proximo no ultimo slide e recusado", m.c.ir_slide("proximo", 7, "PC")[1] == 409)
conferir("slide que nao e numero e recusado", m.c.ir_slide("abc", None, "PC")[1] == 400)

print("\nDois aparelhos no mesmo slide")
m = Mundo()
m.c.ir_musica("luz")
m.c.assumir("PC")
a = m.c.ir_slide("proximo", 0, "PC")
b = m.c.ir_slide("proximo", 0, "Celular")
conferir("o primeiro toque passa", a[1] == 200 and m.c.retrato()["slide"] == 1)
conferir("o segundo, que ainda via o slide antigo, nao anda duas vezes", b[1] == 409 and b[0].get("conflito") and m.telao == [0, 1], b)
conferir("e o comando continua de quem passou", m.c.retrato()["quem"] == "PC")
c = m.c.ir_slide("proximo", 1, "Celular")
conferir("com a tela acertada, o celular passa e fica com o comando", c[1] == 200 and m.c.retrato()["quem"] == "Celular")

print("\nRepetir o refrao")
m = Mundo()
m.c.ir_musica("luz")
m.tocar(3.0)
conferir("antes do primeiro refrao: recusado", m.c.repetir_refrao("PC")[1] == 409)
m.tocar(22.0)
luzes_antes = len(m.luz)
corpo, codigo = m.c.repetir_refrao("PC do telão")
conferir("no verso 2, volta ao refrao que passou", codigo == 200 and m.telao[-1] == 2 and corpo["titulo"] == "PC do telão voltou ao refrão", (corpo, m.telao))
conferir("a letra fica na mao", m.c.retrato()["letra"] == "na_mao")
conferir("a luz vai para o clima do refrao", m.luz[-1] == ("celebracao", "animado") and len(m.luz) == luzes_antes + 1)
m.tocar(24.0)
conferir("e o relogio nao desfaz a luz do refrao", m.luz[-1] == ("celebracao", "animado") and len(m.luz) == luzes_antes + 1, m.luz)
m.c.devolver("PC do telão")
m.c.passo()
conferir("ao devolver, letra e luz voltam ao segundo atual", m.telao[-1] == 4 and m.luz[-1] == ("louvor", "lento"), (m.telao, m.luz))
m.tocar(31.0)
m.c.repetir_refrao("PC")
conferir("dentro do refrao final, repete ele mesmo", m.telao[-1] == 6)
m.c.ir_musica("hino")
conferir("musica sem refrao: recusado, e o retrato ja avisa",
         m.c.repetir_refrao("PC")[1] == 409 and m.c.retrato()["tem_refrao"] is False)

print("\nAtalho de parte e luz na mao")
m = Mundo()
m.c.ir_musica("luz")
m.tocar(1.0)
m.c.ir_parte(2, "PC")
conferir("atalho de parte: vai ao primeiro slide dela, com a luz dela", m.telao[-1] == 4 and m.luz[-1] == ("louvor", "lento"))
m.c.luz_na_mao()
quantas = len(m.luz)
m.tocar(12.0)
m.c.ir_parte(3, "PC")
conferir("com a luz na mao, nem o relogio nem o atalho mexem nela", len(m.luz) == quantas and m.c.retrato()["luz"] == "na_mao")
conferir("a letra nao foi afetada pela luz na mao", m.telao[-1] == 6)
m.c.seguir_luz()
m.c.passo()
conferir("'Seguir a musica' volta a luz para a parte de agora", m.luz[-1] == ("celebracao", "animado") and m.c.retrato()["luz"] == "seguindo")
m.c.luz_na_mao()
m.c.ir_musica("proxima")
conferir("a proxima musica volta a seguir sozinha", m.c.retrato()["luz"] == "seguindo")
conferir("parte que nao existe e recusada", m.c.ir_parte(99, "PC")[1] == 400 and m.c.ir_parte("x", "PC")[1] == 400)

print("\nMusica a mao")
m = Mundo()
corpo, codigo = m.c.ir_musica("canto")
r = m.c.retrato()
conferir("entra na mao, com o motivo", codigo == 200 and r["letra"] == "na_mao" and r["motivo"] == "a_mao" and r["luz"] == "na_mao", r["motivo"])
conferir("nao da para devolver nem segurar", m.c.devolver("PC")[1] == 409 and m.c.segurar(True, "PC")[1] == 409
         and r["pode_devolver"] is False and r["motivo_devolver"] == "esta música não tem tempo marcado")
m.tocar(30.0, musica="canto")
conferir("mesmo com o relogio andando, nada passa sozinho", m.telao == [0] and m.luz == [])
m.c.ir_slide("proximo", 0, "PC")
conferir("os slides passam na mao", m.telao == [0, 1])
m.c.ir_parte(1, "PC")
conferir("o atalho de parte aplica a luz da parte", m.telao[-1] == 2 and m.luz == [("celebracao", "animado")], m.luz)
conferir("'Comecou' e recusado em musica sem tempo", Mundo("cronometro").c.comecou()[1] == 409)

print("\nRelogio sem sinal no meio da musica")
m = Mundo()
m.c.ir_musica("luz")
m.tocar(11.0)
m.andar(10.0, 100)
r = m.c.retrato()
conferir("a letra fica onde estava", m.telao == [0, 2] and r["slide"] == 2, m.telao)
conferir("o retrato diz 'sem o tempo da musica'", r["motivo"] == "sem_tempo" and r["relogio"]["sinal"] is False, r["motivo"])
conferir("anota uma vez so", [n for n in m.notas if "sem o tempo" in n[0]] == [("Luz da Manhã: sem o tempo da música", False)], m.notas)
conferir("devolver e recusado com o motivo", m.c.devolver("PC") == ({"erro": "a música não está tocando"}, 409))
m.tocar(26.0)
conferir("o sinal voltou: retoma do segundo atual", m.telao[-1] == 5 and m.c.retrato()["motivo"] is None)
m.c.ir_musica("rocha")
m.tocar(15.0, musica="luz")
conferir("aviso de OUTRA musica nao conduz a atual", m.telao[-1] == 0 and m.c.retrato()["relogio"]["sinal"] is False, m.telao)

print("\nHolyrics fora do ar")
m = Mundo()
m.holyrics_ok = False
corpo, codigo = m.c.ir_musica("luz")
conferir("trocar de musica avisa que a letra nao chegou", codigo == 200 and corpo["ok"] is False and "não chegou" in corpo["detalhe"], corpo)
conferir("e o retrato carrega o erro", m.c.retrato()["erro_letra"] == "Holyrics fechado")
m.pedidos = 0
m.tocar(11.0)
conferir("a luz segue mesmo sem a letra", m.luz[-1] == ("celebracao", "animado"))
m.andar(3.0, 30)
conferir("30 voltas com o Holyrics fechado: o pedido e uma nova tentativa, mais nada", m.pedidos == 2, m.pedidos)
m.tocar(15.5)
m.andar(3.0, 30)
conferir("slide novo: de novo so duas tentativas", m.pedidos == 4, m.pedidos)
m.holyrics_ok = True
m.tocar(20.5)
conferir("o Holyrics voltou: o proximo slide chega e o erro some", m.telao == [4] and m.c.retrato()["erro_letra"] is None, m.telao)
m.c.assumir("PC")
m.holyrics_ok = False
corpo, codigo = m.c.ir_slide("proximo", None, "PC")
conferir("na mao, o botao responde com o erro", corpo["ok"] is False and m.c.retrato()["slide"] == 5, corpo)

print("\nProxima musica e fim da lista")
m = Mundo()
m.c.ir_musica("luz")
m.tocar(41.0)
conferir("o audio acabou: o retrato avisa, e nada passa sozinho", m.c.retrato()["acabou"] is True and m.mostradas == ["luz"])
m.c.ir_musica("proxima")
conferir("proxima musica zera o relogio", m.relogio.ler()["posicao"] is None and m.mostradas == ["luz", "rocha"])
m.c.ir_musica("hino")
conferir("na ultima, 'proxima' e recusada", m.c.ir_musica("proxima")[1] == 409)
conferir("musica fora da lista e recusada", m.c.ir_musica("xote")[1] == 404)
m.c.encerrar()
conferir("encerrar tira a musica", m.c.retrato()["musica"] is None and m.guardado[-1] is None)
vazio = Mundo()
vazio.lista = []
conferir("sem musicas para hoje: inativo, e 'proxima' e recusada", vazio.c.retrato()["ativo"] is False and vazio.c.ir_musica("proxima")[1] == 409)

print("\nA ponte reiniciou no meio do louvor")
m = Mundo(lembrado="rocha")
r = m.c.retrato()
conferir("volta na mesma musica, na mao", r["musica"]["id"] == "rocha" and r["letra"] == "na_mao" and r["indice"] == 1, r["musica"])
conferir("sem mexer no telao", m.telao == [] and m.mostradas == [])
m.tocar(11.0, musica="rocha")
conferir("so volta a conduzir quando alguem devolve", m.telao == [] and m.c.devolver("PC")[1] == 200 and m.telao == [2], m.telao)
conferir("musica lembrada que nao existe mais nao estoura", Mundo(lembrado="sumiu").c.retrato()["musica"] is None)

print("\nCronometro ('Comecou')")
m = Mundo("cronometro")
m.c.ir_musica("luz")
conferir("antes do 'Comecou' esta esperando", m.c.retrato()["motivo"] == "esperando")
corpo, codigo = m.c.comecou()
conferir("'Comecou' e aceito", codigo == 200 and corpo["titulo"] == "Luz da Manhã: começou")
m.andar(10.2, 102)
conferir("a ponte conta sozinha e passa os slides", m.telao == [0, 1, 2], m.telao)
m.c.acertar(5.0)
m.c.passo()
conferir("acertar +5 s adianta a letra", m.telao[-1] == 3, m.telao)
conferir("acerto absurdo e limitado a 5 s", m.c.acertar(900)[0]["titulo"] == "Tempo da música acertado em +5.0 s")
conferir("com a fonte navegador, 'Comecou' e recusado", (lambda w: (w.c.ir_musica("luz"), w.c.comecou())[1][1])(Mundo()) == 409)

print("\nSeguir sozinho de um slide (a musica comecou e ninguem tocou 'Comecou')")
m = Mundo("cronometro")
m.c.ir_musica("luz")
corpo, codigo = m.c.seguir_de(4, "PC")
r = m.c.retrato()
conferir("tocar no slide 5 poe o slide no telao", codigo == 200 and corpo["ok"] and m.telao == [0, 4], (corpo, m.telao))
conferir("e a letra segue sozinha", r["letra"] == "sozinho" and r["segurando"] is False and r["motivo"] is None, r["motivo"])
conferir("o tempo da musica foi para o inicio do slide 5", abs(r["relogio"]["posicao"] - 20.0) < 0.01, r["relogio"]["posicao"])
m.andar(5.2, 52)
conferir("dali ela continua passando sozinha", m.telao == [0, 4, 5], m.telao)
m.c.seguir_de(1, "PC")
m.andar(5.2, 52)
conferir("tocar num slide para tras volta o tempo e segue", m.telao == [0, 4, 5, 1, 2], m.telao)
m.c.ir_slide("proximo", None, "PC")
conferir("passar a mao assume a letra", m.c.retrato()["letra"] == "na_mao")
m.c.seguir_de(m.c.retrato()["slide"], "PC")
conferir("'Seguir sozinho daqui' devolve ao automatico no slide em que esta",
         m.c.retrato()["letra"] == "sozinho" and m.c.retrato()["slide"] == 3, m.c.retrato()["slide"])
conferir("slide que nao existe e recusado", m.c.seguir_de(99, "PC")[1] == 400)
w = Mundo("cronometro")
w.c.ir_musica("canto")
conferir("musica sem tempo marcado nao segue sozinha", w.c.seguir_de(1, "PC")[1] == 409)
w = Mundo()
w.c.ir_musica("luz")
conferir("com o tempo vindo do audio, seguir de um slide e recusado", w.c.seguir_de(1, "PC")[1] == 409)
conferir("sem musica escolhida e recusado", Mundo("cronometro").c.seguir_de(0, "PC")[1] == 409)

print("\nTirar a letra do telao e voltar")
m = Mundo("cronometro")
m.tirados = 0
m.c = Condutor(m.relogio, lambda: m.lista, m._mostrar, m._slide, m._luz, lambda *a: None,
               agora=lambda: m.t, tirar=lambda: setattr(m, "tirados", m.tirados + 1))
m.c.ir_musica("luz")
m.c.comecou()
m.andar(5.2, 52)
corpo, codigo = m.c.tirar("PC")
conferir("tirar fecha a letra no Holyrics", codigo == 200 and corpo["ok"] and m.tirados == 1, corpo)
conferir("e o retrato diz que esta fora", m.c.retrato()["fora"] is True)
m.andar(10.0, 100)
conferir("fora do telao, o tempo anda mas nada vai ao telao", m.telao == [0, 1] and m.c.retrato()["slide"] == 3, (m.telao, m.c.retrato()["slide"]))
conferir("tirar de novo e recusado", m.c.tirar("PC")[1] == 409)
corpo, codigo = m.c.voltar("PC")
conferir("voltar reabre a musica no slide em que o tempo esta",
         codigo == 200 and corpo["ok"] and m.mostradas == ["luz", "luz"] and m.telao[-1] == 3, (m.mostradas, m.telao))
conferir("e a letra continua sozinha", m.c.retrato()["fora"] is False and m.c.retrato()["letra"] == "sozinho")
conferir("voltar sem ter tirado e recusado", m.c.voltar("PC")[1] == 409)
m.c.tirar("PC")
m.c.ir_slide("proximo", None, "PC")
conferir("passar o slide a mao tambem traz a letra de volta",
         m.c.retrato()["fora"] is False and m.mostradas[-1] == "luz" and m.telao[-1] == 4, m.telao)
m.c.tirar("PC")
m.c.ir_musica("rocha")
conferir("trocar de musica poe a letra de volta", m.c.retrato()["fora"] is False)
conferir("sem como tirar neste PC, o pedido e recusado", Mundo().c.tirar("PC")[1] == 400)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
