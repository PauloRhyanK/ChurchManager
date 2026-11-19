"""Testes de ver e passar slides pelo painel, e do passador de slides.
Rodam sem Holyrics, sem o passador e sem Windows:

    python _testar_telao_passador.py

O que NAO da para testar aqui: a captura das teclas pelo Windows (Raw Input)
e as teclas que o Spotlight manda de verdade. Isso e com o
descobrir_passador.py, no PC da igreja.
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

from ponte import passador as mod_passador   # noqa: E402
from ponte import simulados, telao as mod_telao   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


def esperar(condicao, limite=2.0):
    fim = time.time() + limite
    while time.time() < fim:
        if condicao():
            return True
        time.sleep(0.02)
    return False


print("\nO telao: ler o que esta aberto no Holyrics")
h = simulados.HolyricsSimulado()
t = mod_telao.Telao(lambda: h)
t.ler()
conferir("nada aberto: vazio, mas respondendo", t.retrato() == {"responde": True, "vazio": True, "erro": None})
h.pedir("ShowLyrics", {"id": "777"})
t.ler()
r = t.retrato()
conferir("musica aberta: nome, slide (do zero) e total", (r["nome"], r["slide"], r["total"], r["vazio"]) == ("Música 777", 0, 40, False), r)
conferir("a lista de slides veio, com a letra", len(t.slides()) == 40 and t.slides()[1]["linhas"] and r["tem_lista"])
conferir("linha // vira instrucao, fora da letra", t.slides()[0]["instrucoes"] == [{"para": "Todos", "texto": "uníssono"}], t.slides()[0])
pedidos = len([p for p in h.historico if p[1].get("include_slides")])
t.ler()
t.ler()
conferir("a lista so e pedida quando a apresentacao muda", len([p for p in h.historico if p[1].get("include_slides")]) == pedidos == 1)
versao = t.versao()
h.pedir("ShowLyrics", {"id": "888"})
t.ler()
conferir("trocou a apresentacao: lista e versao novas", t.versao() != versao and t.retrato()["nome"] == "Música 888")

print("\nO telao: passar")
corpo, codigo = t.ir("proximo", 0)
conferir("proximo usa a acao do Holyrics", codigo == 200 and ("ActionNext", {}) in h.historico and h.slide == 1, corpo)
conferir("e o retrato ja traz o slide novo", t.retrato()["slide"] == 1)
t.ir("anterior", 1)
conferir("anterior", ("ActionPrevious", {}) in h.historico and t.retrato()["slide"] == 0)
t.ir(7, None)
conferir("tocar num slide vai direto, com o indice do zero", ("ActionGoToIndex", {"index": 7}) in h.historico and t.retrato()["slide"] == 7)
a = t.ir("proximo", 7)
b = t.ir("proximo", 7)
conferir("dois toques vendo o mesmo slide: anda uma vez so", a[1] == 200 and b[1] == 409 and b[0]["conflito"] and h.slide == 8)
conferir("slide que nao existe e recusado", t.ir(99, None)[1] == 400 and t.ir("abc", None)[1] == 400)
h.pedir("CloseCurrentPresentation")
t.ler()
conferir("sem nada no telao, passar e recusado", t.ir("proximo")[1] == 409)


class Quebrado:
    def pedir(self, acao, payload=None):
        if acao.startswith("Action"):
            raise RuntimeError("o Holyrics recusou o token do config.yaml")
        return {"status": "ok", "data": {"id": "1", "type": "song", "name": "X", "slide_number": 2, "total_slides": 5}}


q = mod_telao.Telao(lambda: Quebrado())
q.ler()
corpo, codigo = q.ir("proximo")
conferir("sem permissao no token: avisa, sem estourar", codigo == 200 and corpo["ok"] is False and q.retrato()["erro"], corpo)
conferir("item sem lista de slides (versiculo): segue com os numeros", q.slides() == [] and q.retrato()["slide"] == 1 and q.retrato()["tem_lista"] is False)
fora = mod_telao.Telao(lambda: None)
fora.ler()
conferir("Holyrics desligado: nao responde, e passar e recusado", fora.retrato()["responde"] is False and fora.ir("proximo")[1] == 400)

print("\nO passador: so o Spotlight, so as teclas dele")
SPOT = r"\\?\HID#VID_046D&PID_C53E&MI_00#8&2f1a&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}"
TECLADO = r"\\?\HID#VID_046D&PID_C31C&MI_00#7&1a2b&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}"
PGDN, PGUP, DIREITA, ESQUERDA, F5 = 0x22, 0x21, 0x27, 0x25, 0x74


class Mundo:
    def __init__(self, config=None):
        self.t = 1000.0
        self.passados = []
        self.em_foco = False
        self.p = mod_passador.Passador(config or {}, self.passados.append, lambda: self.em_foco, agora=lambda: self.t)

    def tecla(self, dispositivo, codigo, apertou=True, depois=1.0):
        self.t += depois
        feito = self.p.tecla(dispositivo, codigo, apertou)
        esperar(lambda: True, 0.05)
        return feito


m = Mundo()
conferir("antes de qualquer clique: nao sabe se esta conectado", m.p.retrato() == {"ativo": True, "suportado": True, "conectado": None, "ultimo": None})
conferir("PageDown do Spotlight: proximo", m.tecla(SPOT, PGDN) == "proximo" and esperar(lambda: m.passados == ["proximo"]))
conferir("PageUp do Spotlight: anterior", m.tecla(SPOT, PGUP) == "anterior" and esperar(lambda: m.passados == ["proximo", "anterior"]))
conferir("setas tambem valem, de fabrica", m.tecla(SPOT, DIREITA) == "proximo" and m.tecla(SPOT, ESQUERDA) == "anterior")
esperar(lambda: len(m.passados) == 4)
antes = list(m.passados)
conferir("PageDown de um teclado comum (mesmo sendo Logitech) e ignorado", m.tecla(TECLADO, PGDN) is None and m.passados == antes)
conferir("soltar a tecla nao conta", m.tecla(SPOT, PGDN, apertou=False) is None and m.passados == antes)
conferir("botao sem funcao fica registrado, sem passar nada", m.tecla(SPOT, F5) == "sem_funcao" and m.passados == antes
         and m.p.retrato()["ultimo"]["tecla"] == "F5")
m.tecla(SPOT, PGDN)
conferir("a mesma tecla em menos de 0,12 s e o mesmo aperto", m.tecla(SPOT, PGDN, depois=0.05) is None)
conferir("passado esse tempo, vale de novo", m.tecla(SPOT, PGDN, depois=0.3) == "proximo")
r = m.p.retrato()
conferir("o retrato mostra conectado e o ultimo clique", r["conectado"] is True and r["ultimo"]["acao"] == "proximo"
         and r["ultimo"]["tecla"] == "PageDown" and r["ultimo"]["texto"] == "próximo slide", r)

print("\nO passador: com o Holyrics em foco, fica quieto")
m = Mundo()
m.em_foco = True
conferir("nao passa (o Holyrics ja recebeu a tecla)", m.tecla(SPOT, PGDN) == "em_foco" and m.passados == [])
conferir("mas o clique aparece no painel, com o motivo", "em foco" in m.p.retrato()["ultimo"]["texto"])
m.em_foco = False
conferir("com outra janela em foco, passa", m.tecla(SPOT, PGDN) == "proximo" and esperar(lambda: m.passados == ["proximo"]))
m2 = Mundo({"ignorar_com_holyrics_em_foco": False})
m2.em_foco = True
conferir("da para desligar essa regra no config", m2.tecla(SPOT, PGDN) == "proximo")

print("\nO passador: config")
conferir("ativo: false desliga tudo", Mundo({"ativo": False}).tecla(SPOT, PGDN) is None)
m = Mundo({"dispositivo": "VID_1234&PID_ABCD", "proximo": ["Down"], "anterior": "Up"})
conferir("outro aparelho e outras teclas", m.tecla(r"\\?\HID#vid_1234&pid_abcd#x", 0x28) == "proximo"
         and m.tecla(r"\\?\HID#vid_1234&pid_abcd#x", 0x26) == "anterior" and m.tecla(SPOT, PGDN) is None)
conferir("PageDown deixa de valer quando o config escolhe outras", m.tecla(r"\\?\HID#VID_1234&PID_ABCD#x", PGDN) == "sem_funcao")
conferir("tecla com nome errado no config e ignorada, sem estourar", Mundo({"proximo": ["Pandeiro"]}).tecla(SPOT, PGDN) == "sem_funcao")
m = Mundo()
m.p.presentes([TECLADO])
conferir("o Windows nao enxerga o receptor: desconectado", m.p.retrato()["conectado"] is False)
m.p.presentes([TECLADO, SPOT])
conferir("enxerga: conectado", m.p.retrato()["conectado"] is True)
conferir("o Spotlight por Bluetooth tambem e reconhecido", m.p.e_o_passador(r"\\?\HID#{00001124}_VID&02046d_PID&b503#9&x"))
falha = mod_passador.Passador({}, lambda para: 1 / 0, agora=lambda: 5.0)
falha.tecla(SPOT, PGDN)
conferir("se passar falhar, o painel fica sabendo", esperar(lambda: falha.retrato()["ultimo"]["acao"] == "falhou"))
conferir("fora do Windows nao ha o que ouvir, e nada estoura",
         mod_passador.no_windows() or (mod_passador.OuvinteDoTeclado(lambda *a: None).comecar() is False
                                       and mod_passador.holyrics_em_foco() is False))

# ---------------------------------------------------------------------------
print("\nNo painel")
import app as ponte   # noqa: E402

ponte.CAMINHO_PONTEIRO = os.path.join(PASTA, "_ordem_atual.json")
ponte.CAMINHO_LOUVOR = os.path.join(PASTA, "_louvor_atual.json")
ponte.CAMINHO_MARCAS = os.path.join(PASTA, "_marcas_louvor.json")
ponte.CAMINHO_PALAVRA = os.path.join(PASTA, "_palavra_do_dia.json")
with open(ponte.CAMINHO_MARCAS, "w", encoding="utf-8") as arquivo:
    json.dump({"avante": [{"nome": "Verso 1", "segundo": 0, "slide": 0}, {"nome": "Refrão", "segundo": 10, "slide": 3}]}, arquivo)
ponte._config = ponte.carregar_config()
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
TELAO, PASSADOR = ponte._pecas["telao"], ponte._pecas["passador"]


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


def clicar(tecla="PageDown"):
    return cliente.post("/api/passador/simular", json={"tecla": tecla}).get_json()["feito"]


HOLY.pedir("ShowLyrics", {"id": "555"})
TELAO.ler()
r = cliente.get("/api/painel").get_json()
conferir("o retrato traz o que esta aberto no telao", r["telao_ao_vivo"]["nome"] == "Música 555" and r["telao_ao_vivo"]["slide"] == 0)
conferir("e o estado do passador", r["passador"]["ativo"] is True and "ultimo" in r["passador"])
conteudo = cliente.get("/api/painel/conteudo").get_json()
conferir("os slides vao no conteudo, e a versao acompanha a apresentacao",
         len(conteudo["telao"]) == 40 and conteudo["versao"] == r["conteudo_versao"] and "FIRME" not in json.dumps(r))
antes = len(ponte._historico)
corpo, codigo = acao({"tipo": "telao_slide", "para": "proximo", "visto": 0, "quem": "Celular"})
conferir("proximo pelo painel chega ao Holyrics", codigo == 200 and HOLY.slide == 1, corpo)
conferir("e nao enche o 'Aconteceu agora'", len(ponte._historico) == antes)
acao({"tipo": "telao_slide", "para": 5, "quem": "Celular"})
conferir("tocar num slide vai direto", HOLY.slide == 5)
conferir("pela web, passar slide do telao e recusado", acao({"tipo": "telao_slide", "para": "proximo"}, "web")[1] == 403 and HOLY.slide == 5)
conferir("o passador passa o que esta aberto no Holyrics", clicar() == "proximo" and esperar(lambda: HOLY.slide == 6), HOLY.slide)
conferir("e volta", clicar("PageUp") == "anterior" and esperar(lambda: HOLY.slide == 5))
r = cliente.get("/api/painel").get_json()
conferir("o painel mostra o ultimo clique", r["passador"]["conectado"] is True and r["passador"]["ultimo"]["acao"] == "anterior", r["passador"])

print("\nPassar a mao assume o automatico")
acao({"tipo": "ir", "momento": "louvor"})
acao({"tipo": "louvor_musica", "para": "avante"})
cliente.post("/api/relogio", json={"fonte": "navegador", "musica": "avante", "posicao": 1.0, "tocando": True})
ponte._pecas["condutor"].passo()
conferir("a musica esta sozinha", cliente.get("/api/painel").get_json()["louvor"]["letra"] == "sozinho")
time.sleep(0.2)
conferir("um clique do passador durante a musica", clicar() == "proximo")
conferir("assume a letra, em nome do passador", esperar(lambda: ponte._pecas["condutor"].retrato()["letra"] == "na_mao")
         and ponte._pecas["condutor"].retrato()["quem"] == "Passador" and ponte._pecas["condutor"].retrato()["slide"] == 1,
         ponte._pecas["condutor"].retrato()["quem"])
acao({"tipo": "louvor_devolver", "quem": "PC"})
acao({"tipo": "telao_slide", "para": "proximo", "quem": "Celular"})
conferir("o botao do painel tambem assume", ponte._pecas["condutor"].retrato()["letra"] == "na_mao"
         and ponte._pecas["condutor"].retrato()["quem"] == "Celular")
acao({"tipo": "ir", "momento": "avisos"})

print("\nNa palavra, o passador anda nos slides dela")
with open(ponte.CAMINHO_PALAVRA, "w", encoding="utf-8") as arquivo:
    json.dump({"sermon": {"title": "Luz", "slides": [{"kind": "TITLE", "text": "Luz"}, {"kind": "POINT", "text": "1. Chama"},
                                                    {"kind": "POINT", "text": "2. Mostra"}]}}, arquivo)
acao({"tipo": "ir", "momento": "pregacao"})
time.sleep(0.2)
clicar()
conferir("o primeiro clique poe o primeiro slide da palavra", esperar(lambda: ponte._pecas["palavra"].retrato()["slide"] == 0)
         and ponte._pecas["palavra"].retrato()["quem"] == "Passador", ponte._pecas["palavra"].retrato())
time.sleep(0.2)
clicar()
conferir("o segundo anda", esperar(lambda: ponte._pecas["palavra"].retrato()["slide"] == 1))
conferir("fora da simulacao a rota de faz de conta nao existe", ponte.SIMULAR is True)
for nome in ("descobrir_passador.py",):
    conferir("'{}' esta no pacote e existe".format(nome), nome in ponte.PACOTE and os.path.exists(os.path.join(AQUI, nome)))

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
