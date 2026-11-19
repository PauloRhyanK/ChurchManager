"""Testes da palavra e do celular do pregador. Rodam sem Holyrics e sem internet:

    python _testar_palavra.py

A primeira metade testa ponte/palavra.py sozinho. A segunda sobe o app.py e a
versao web DENTRO do teste, com o Holyrics de mentira, e confere o caminho
inteiro do toque do pregador: pelo Wi-Fi (direto) e pela internet (fila da web).
"""

import hashlib
import json
import os
import sys
import tempfile
import threading
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

from ponte import palavra as mod   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


SERMAO = {"sermon": {
    "title": "Luz que não se apaga", "preacherName": "Pr. Fulano", "style": "MINIMAL", "estimatedMinutes": 40,
    "slides": [
        {"index": 0, "kind": "TITLE", "text": "Luz que não se apaga", "reference": None},
        {"index": 1, "kind": "VERSE", "text": "Eu sou a luz do mundo;", "reference": "João 8:12"},
        {"index": 2, "kind": "VERSE", "text": "quem me segue não andará em trevas.", "reference": "João 8:12"},
        {"index": 3, "kind": "POINT", "text": "1. A luz chama", "reference": None},
        {"index": 4, "kind": "VERSE", "text": "Lâmpada para os meus pés é a tua palavra.", "reference": "Salmos 119:105"},
        {"index": 5, "kind": "PRIVATE", "text": "", "reference": None},
        "lixo",
    ]}}

print("\nO formato do modulo Palavras")
p = mod.normalizar(SERMAO)
conferir("titulo, pregador e minutos", (p["titulo"], p["pregador"], p["minutos"]) == ("Luz que não se apaga", "Pr. Fulano", 40))
conferir("slides vazios e lixo ficam de fora", len(p["slides"]) == 5, len(p["slides"]))
conferir("cada slide tem rotulo em portugues", [s["rotulo"] for s in p["slides"]] == ["Título", "Versículo", "Versículo", "Ponto", "Versículo"])
conferir("sem palavra: None", mod.normalizar(None) is None and mod.normalizar({}) is None and mod.normalizar({"sermon": None}) is None)
conferir("aceita o sermao sem o embrulho", mod.normalizar(SERMAO["sermon"])["versao"] == p["versao"])
conferir("tipo desconhecido vira Ponto", mod.normalizar({"title": "x", "slides": [{"kind": "OUTRO", "text": "a"}]})["slides"][0]["tipo"] == "POINT")

print("\nA fonte local (arquivo)")
caminho = os.path.join(PASTA, "_palavra_do_dia.json")
fonte = mod.FontePalavraLocal(caminho)
conferir("sem o arquivo: sem palavra", fonte.palavra() is None)
with open(caminho, "w", encoding="utf-8") as arquivo:
    json.dump(SERMAO, arquivo)
conferir("le o arquivo", fonte.palavra()["titulo"] == "Luz que não se apaga")
with open(caminho, "w", encoding="utf-8") as arquivo:
    arquivo.write("{ quebrado")
os.utime(caminho, (time.time() + 5, time.time() + 5))
conferir("arquivo quebrado nao derruba", fonte.palavra() is None)


class Holyrics:
    def __init__(self):
        self.pedidos = []
        self.recusa = None

    def pedir(self, acao, payload=None):
        if self.recusa and acao in self.recusa:
            raise RuntimeError("o Holyrics recusou o token do config.yaml")
        self.pedidos.append((acao, payload or {}))
        return {"status": "ok"}


class Mundo:
    def __init__(self, sermao=SERMAO, config=None):
        self.t = 1_000_000.0
        self.sermao = mod.normalizar(sermao)
        self.h = Holyrics()
        self.notas = []
        self.telao = mod.TelaoDaPalavra(lambda: self.h, lambda: config or {})
        self.p = mod.Palavra(lambda: self.sermao, self.telao.mostrar, self.telao.tirar,
                             lambda *a: self.notas.append(a), agora=lambda: self.t)


print("\nO telao: versiculo so pela referencia")
m = Mundo()
r = m.p.retrato()
conferir("antes de qualquer toque: ativa, nada no telao", r["ativa"] and r["slide"] is None and r["visivel"] is False and r["quem"] is None)
corpo, codigo = m.p.ir("proximo", -1, "PC do telão")
conferir("o primeiro 'Proximo' poe o slide 1", codigo == 200 and corpo["titulo"] == "Palavra: slide 1 de 5", corpo)
conferir("titulo vai como texto", m.h.pedidos == [("ShowQuickPresentation", {"text": "Luz que não se apaga"})], m.h.pedidos)
m.p.ir("proximo", 0, "PC do telão")
conferir("versiculo vai SO a referencia, nunca o texto", m.h.pedidos[-1] == ("ShowVerse", {"references": "João 8:12"}), m.h.pedidos[-1])
m.p.ir("proximo", 1, "PC do telão")
conferir("o mesmo versiculo em dois slides nao e pedido de novo", len(m.h.pedidos) == 2 and m.p.retrato()["slide"] == 2)
m.p.ir("anterior", 2, "PC do telão")
conferir("voltar dentro do mesmo versiculo tambem nao pisca", len(m.h.pedidos) == 2)
m.p.ir(4, None, "PC do telão")
conferir("clicar num slide vai direto", m.h.pedidos[-1] == ("ShowVerse", {"references": "Salmos 119:105"}))
conferir("no ultimo, 'Proximo' e recusado", m.p.ir("proximo", 4, "x")[1] == 409)
m2 = Mundo(config={"palavra": {"versiculo": {"acao": "ShowBible", "campo": "input"}}})
m2.p.ir(1, None, "PC")
conferir("o config troca o nome da acao e do campo", m2.h.pedidos == [("ShowBible", {"input": "João 8:12"})], m2.h.pedidos)

print("\nTirar do telao e voltar")
m = Mundo()
conferir("tirar sem nada no telao e recusado", m.p.tirar("PC")[1] == 409)
m.p.ir(3, None, "PC")
corpo, codigo = m.p.tirar("PC do telão")
conferir("tira, sem perder o lugar", codigo == 200 and m.h.pedidos[-1][0] == "CloseCurrentPresentation"
         and m.p.retrato()["slide"] == 3 and m.p.retrato()["visivel"] is False)
m.p.ir("proximo", 3, "PC do telão")
conferir("'Proximo' traz de volta o MESMO slide", m.p.retrato()["slide"] == 3 and m.p.retrato()["visivel"] and m.h.pedidos[-1][1] == {"text": "1. A luz chama"})
m.p.ir(1, None, "PC")
m.p.tirar("PC")
m.p.ir("proximo", 1, "PC")
conferir("versiculo tirado e trazido de volta e pedido de novo", [a for a, _ in m.h.pedidos].count("ShowVerse") == 2)

print("\nQuem esta passando: vale o ultimo toque")
m = Mundo()
m.p.ir("proximo", -1, mod.PREGADOR)
conferir("o retrato diz que e o pregador", m.p.retrato()["quem_e_o_pregador"] is True)
a = m.p.ir("proximo", 0, mod.PREGADOR)
b = m.p.ir("proximo", 0, "PC do telão")
conferir("dois toques no mesmo slide: anda uma vez so", a[1] == 200 and b[1] == 409 and b[0]["conflito"] and m.p.retrato()["slide"] == 1)
corpo, codigo = m.p.assumir("PC do telão")
conferir("assumir marca o operador, sem travar ninguem", codigo == 200 and m.p.retrato()["quem"] == "PC do telão" and not m.p.retrato()["quem_e_o_pregador"])
conferir("o pregador toca de novo e volta a ser ele", m.p.ir("proximo", 1, mod.PREGADOR)[1] == 200 and m.p.retrato()["quem_e_o_pregador"])
conferir("slide que nao e numero e recusado", m.p.ir("abc", None, "x")[1] == 400)

print("\nSem permissao no Holyrics")
m = Mundo()
m.h.recusa = {"ShowVerse"}
corpo, codigo = m.p.ir(1, None, "PC do telão")
conferir("a lista segue, e a resposta manda abrir a mao", codigo == 200 and corpo["ok"] is False and "abra no Holyrics: João 8:12" in corpo["detalhe"], corpo)
conferir("o retrato carrega o erro, para a tela marcar o slide", m.p.retrato()["erro"] and m.p.retrato()["slide"] == 1)
m.p.ir(3, None, "PC do telão")
conferir("o slide seguinte, que e texto, chega e limpa o erro", m.p.retrato()["erro"] is None and m.h.pedidos[-1][0] == "ShowQuickPresentation")
sem = mod.Palavra(lambda: None, lambda s: None, lambda: None, lambda *a: None)
conferir("sem palavra para hoje: inativa, e passar e recusado", sem.retrato() == {"ativa": False, "link": None} and sem.ir("proximo", -1, "x")[1] == 409)

print("\nO pregador mexeu nos slides no meio do culto")
m = Mundo()
m.p.ir(4, None, "PC")
menor = json.loads(json.dumps(SERMAO))
menor["sermon"]["slides"] = menor["sermon"]["slides"][:2]
m.sermao = mod.normalizar(menor)
r = m.p.retrato()
conferir("o lugar que nao existe mais e acertado, sem estourar", r["total"] == 2 and r["slide"] == 1 and r["visivel"] is False, r)

print("\nO link do pregador")
m = Mundo()
conferir("sem link: nada confere", m.p.confere("qualquer") is False and m.p.retrato()["link"] is None and m.p.codigo() is None)
codigo_1 = m.p.gerar_link()
conferir("o codigo e sorteado e comprido", len(codigo_1) >= 20 and m.p.confere(codigo_1))
link = m.p.retrato()["link"]
conferir("o retrato leva so o RESUMO do codigo, nunca o codigo",
         link["resumo"] == hashlib.sha256(codigo_1.encode()).hexdigest() and codigo_1 not in json.dumps(m.p.retrato()))
conferir("codigo errado, vazio ou torto nao confere", not m.p.confere(codigo_1 + "x") and not m.p.confere("") and not m.p.confere(None))
codigo_2 = m.p.gerar_link()
conferir("um link novo mata o anterior", m.p.confere(codigo_2) and not m.p.confere(codigo_1))
m.t += 6 * 3600 + 1
conferir("morre em 6 horas", not m.p.confere(codigo_2) and m.p.retrato()["link"] is None and not m.p.tem_link())
codigo_3 = m.p.gerar_link()
m.p.encerrar_link()
conferir("'Encerrar o acesso' mata na hora", not m.p.confere(codigo_3))

# ---------------------------------------------------------------------------
print("\nPelo painel e pelo Wi-Fi da igreja")
import app as ponte          # noqa: E402
from ponte import simulados   # noqa: E402

ponte.CAMINHO_PONTEIRO = os.path.join(PASTA, "_ordem_atual.json")
ponte.CAMINHO_LOUVOR = os.path.join(PASTA, "_louvor_atual.json")
ponte.CAMINHO_MARCAS = os.path.join(PASTA, "_marcas_louvor.json")
ponte.CAMINHO_PALAVRA = caminho
with open(caminho, "w", encoding="utf-8") as arquivo:
    json.dump(SERMAO, arquivo)
os.utime(caminho, (time.time() + 10, time.time() + 10))
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


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


r = cliente.get("/api/painel").get_json()
conferir("o retrato traz a palavra", r["palavra"]["ativa"] and r["palavra"]["total"] == 5 and r["palavra"]["no_momento"] is False)
conferir("os slides vao no conteudo, nao no retrato de rotina", "A luz chama" not in json.dumps(r)
         and cliente.get("/api/painel/conteudo").get_json()["palavra"][3]["texto"] == "1. A luz chama")
conferir("a versao do conteudo junta musicas e palavra", r["conteudo_versao"] == cliente.get("/api/painel/conteudo").get_json()["versao"])
acao({"tipo": "ir", "momento": "pregacao"})
r = cliente.get("/api/painel").get_json()
conferir("no momento da palavra: a tela sabe, com o tempo", r["palavra"]["no_momento"] and r["palavra"]["de_minutos"] == 40
         and r["palavra"]["passou_s"] is not None, r["palavra"])
antes = len(ponte._historico)
corpo, codigo = acao({"tipo": "palavra_slide", "para": "proximo", "visto": -1, "quem": "PC do telão"})
conferir("o operador passa pelo painel", codigo == 200 and HOLY.historico[-1] == ("ShowQuickPresentation", {"text": "Luz que não se apaga"}), HOLY.historico[-1])
conferir("passar slide nao enche o historico", len(ponte._historico) == antes)
for tipo in ("palavra_slide", "palavra_assumir", "palavra_tirar", "pregador_link"):
    conferir("pela web, '{}' e recusada".format(tipo), acao({"tipo": tipo, "para": "proximo", "acao": "gerar"}, "web")[1] == 403)
conferir("sem link gerado, a pagina do pregador nao abre", cliente.get("/pregador/abc").status_code == 404
         and cliente.get("/api/pregador/abc").status_code == 404 and cliente.get("/api/painel/pregador").get_json() == {"ativo": False})
corpo, codigo = acao({"tipo": "pregador_link", "acao": "gerar"})
enderecos = cliente.get("/api/painel/pregador").get_json()
CODIGO = enderecos["local"].rsplit("/", 1)[1]
conferir("gerar o link devolve o endereco local", codigo == 200 and enderecos["ativo"] and "/pregador/" in enderecos["local"] and enderecos["web"] is None, enderecos)
conferir("o codigo NAO aparece no retrato que vai para a web", CODIGO not in json.dumps(cliente.get("/api/painel").get_json()))
pagina = cliente.get("/pregador/" + CODIGO)
conferir("com o codigo certo a pagina abre, sem senha", pagina.status_code == 200 and "Próximo".encode() in pagina.data)
pagina.close()
dele = cliente.get("/api/pregador/" + CODIGO).get_json()
conferir("o celular recebe os slides, o lugar e o tempo", len(dele["slides"]) == 5 and dele["slide"] == 0 and dele["de_minutos"] == 40 and "link" not in dele, dele.keys())
resposta = cliente.post("/api/pregador/" + CODIGO, json={"para": "proximo", "visto": 0})
conferir("o toque do pregador chega ao Holyrics", resposta.status_code == 200 and HOLY.historico[-1] == ("ShowVerse", {"references": "João 8:12"}), HOLY.historico[-1])
conferir("e o painel diz que e ele", cliente.get("/api/painel").get_json()["palavra"]["quem_e_o_pregador"] is True)
conferir("o celular so anda para frente e para tras", cliente.post("/api/pregador/" + CODIGO, json={"para": 4}).status_code == 400)
conferir("codigo errado nao passa slide", cliente.post("/api/pregador/errado", json={"para": "proximo"}).status_code == 404)
ponte._remoto["aceita"] = False
ponte._pedido_da_web({"tipo": "pregador", "corpo": {"codigo": CODIGO, "para": "proximo", "visto": 1}})
conferir("pela internet, o toque passa mesmo com 'So mostra' ligado", ponte._pecas["palavra"].retrato()["slide"] == 2)
ponte._pedido_da_web({"tipo": "pregador", "corpo": {"codigo": "errado", "para": "proximo"}})
ponte._pedido_da_web({"tipo": "pregador", "corpo": {"codigo": CODIGO, "para": 0}})
conferir("pedido da web com codigo errado ou alvo livre e ignorado", ponte._pecas["palavra"].retrato()["slide"] == 2)
ponte._remoto["aceita"] = True
for nome in ("pregador.html", "verificar_palavra.py"):
    conferir("'{}' esta no pacote e existe".format(nome), nome in ponte.PACOTE and os.path.exists(os.path.join(AQUI, nome)))

print("\nPela internet (versao web)")
import importlib.util   # noqa: E402

espec = importlib.util.spec_from_file_location("ponte_web", os.path.join(AQUI, "..", "web", "app.py"))
web = importlib.util.module_from_spec(espec)
espec.loader.exec_module(web)
celular = web.app.test_client()        # sem senha: e o celular do pregador
CHAVE = {"X-Ponte-Chave": os.environ["PONTE_CHAVE"]}


def igreja_liga():
    return celular.post("/api/espelho", headers=CHAVE, json={
        "chegada": {"passos": []}, "painel": cliente.get("/api/painel").get_json(),
        "conteudo": cliente.get("/api/painel/conteudo").get_json()}).get_json()


conferir("antes de a igreja ligar, nenhum codigo vale", celular.get("/api/pregador/" + CODIGO).status_code == 404)
igreja_liga()
pagina = celular.get("/pregador/" + CODIGO)
conferir("a web abre a pagina do pregador SEM a senha da equipe", pagina.status_code == 200)
pagina.close()
conferir("mas o resto continua pedindo senha", celular.get("/painel").status_code == 302 and celular.get("/api/painel").status_code == 401)
dele = celular.get("/api/pregador/" + CODIGO).get_json()
conferir("o celular recebe os slides pela web", len(dele["slides"]) == 5 and dele["slide"] == 2 and dele["local"] is False and "link" not in dele)
resposta = celular.post("/api/pregador/" + CODIGO, json={"para": "proximo", "visto": 2})
conferir("o toque entra na fila", resposta.get_json() == {"ok": True, "enviado": True})
conferir("o celular nao escolhe slide pela web", celular.post("/api/pregador/" + CODIGO, json={"para": 4}).status_code == 400)
comecou = time.time()
pedidos = celular.post("/api/espelho/pedidos", headers=CHAVE).get_json()
conferir("a igreja, pendurada, recebe o toque na hora", time.time() - comecou < 1 and pedidos["comandos"] == [
    {"tipo": "pregador", "passo": None, "corpo": {"codigo": CODIGO, "para": "proximo", "visto": 2}}], pedidos)
for comando in pedidos["comandos"]:
    ponte._pedido_da_web(comando)
conferir("e ele chega ao telao da igreja", ponte._pecas["palavra"].retrato()["slide"] == 3 and HOLY.historico[-1][1] == {"text": "1. A luz chama"})
conferir("o toque nao e entregue duas vezes", igreja_liga()["comandos"] == [])
conferir("a espera longa exige a chave da igreja", celular.post("/api/espelho/pedidos").status_code == 403)

resultado = {}


def esperar():
    resultado["em"] = time.time()
    resultado["corpo"] = web.app.test_client().post("/api/espelho/pedidos", headers=CHAVE).get_json()
    resultado["levou"] = time.time() - resultado["em"]


fio = threading.Thread(target=esperar)
fio.start()
time.sleep(0.4)
celular.post("/api/pregador/" + CODIGO, json={"para": "anterior", "visto": 3})
fio.join(timeout=5)
conferir("quem ja estava esperando e acordado pelo toque", not fio.is_alive() and 0.3 < resultado.get("levou", 99) < 2
         and resultado["corpo"]["comandos"][0]["corpo"]["para"] == "anterior", resultado.get("levou"))

for _ in range(5):
    celular.get("/api/pregador/chute")
conferir("cinco codigos errados travam aquele endereco por um minuto", celular.get("/api/pregador/" + CODIGO).status_code == 429)
web._tentativas.clear()
acao({"tipo": "pregador_link", "acao": "encerrar"})
igreja_liga()
conferir("encerrado na igreja, o link morre na web tambem", celular.get("/api/pregador/" + CODIGO).status_code == 404)
web._tentativas.clear()
acao({"tipo": "pregador_link", "acao": "gerar"})
novo = cliente.get("/api/painel/pregador").get_json()["local"].rsplit("/", 1)[1]
acao({"tipo": "ordem", "id": "quinta"})
conferir("trocar a ordem do culto mata o link", ponte._pecas["palavra"].confere(novo) is False)

print("\nO conferidor do Holyrics")
import verificar_palavra   # noqa: E402

conferir("'unauthorized action' quer dizer falta liberar", verificar_palavra.veredito(401, {"error": "unauthorized action"}) == "falta liberar")
conferir("'invalid token' quer dizer token errado", verificar_palavra.veredito(401, {"error": "invalid token"}) == "token errado")
conferir("404 quer dizer que a acao nao existe", verificar_palavra.veredito(404, {}) == "nao existe")
conferir("qualquer outra resposta: liberada", verificar_palavra.veredito(200, {"status": "error", "error": "missing parameter"}) == "liberada")
conferir("as acoes de fabrica e a troca pelo config", verificar_palavra.acoes({})["versiculo"]["acao"] == "ShowVerse"
         and verificar_palavra.acoes({"palavra": {"texto": {"acao": "ShowText"}}})["texto"] == {"acao": "ShowText", "campo": "text"})

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
