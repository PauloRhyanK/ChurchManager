"""Testes do painel do culto ao vivo. Rodam sem OBS, sem Holyrics, sem luz e
sem subir servidor:

    python _testar_painel_ao_vivo.py

Sobe o app.py e a versao web DENTRO do teste (cliente de teste do Flask), com
o OBS e o Holyrics de mentira de ponte/simulados.py. Confere o que nao pode
quebrar numa atualizacao: as chaves antigas do retrato, a lista fechada de
acoes, o que a web pode pedir, e qual tela cada lado serve.
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
os.environ.setdefault("PONTE_SENHA", "senha-de-teste")
os.environ.setdefault("PONTE_CHAVE", "chave-de-teste-com-mais-de-24-letras")
os.environ["PONTE_DADOS"] = PASTA
os.environ["PONTE_HTTP"] = "1"

import app as ponte          # noqa: E402
from ponte import obs_imagem, painel_ao_vivo, simulados   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


# -- sobe a ponte por dentro, como o main() faz, sem abrir porta --------------
# Os arquivos de estado vao para uma pasta temporaria: o teste nao pode
# escrever na pasta do projeto nem ler as marcas de quem esta desenvolvendo.
ponte.CAMINHO_PONTEIRO = os.path.join(PASTA, "_ordem_atual.json")
ponte.CAMINHO_LOUVOR = os.path.join(PASTA, "_louvor_atual.json")
ponte.CAMINHO_MARCAS = os.path.join(PASTA, "_marcas_louvor.json")
MARCAS = [{"nome": "Verso 1", "segundo": 0, "cena": "louvor", "modo": "lento", "slide": 0},
          {"nome": "Refrão", "segundo": 10, "cena": "celebracao", "modo": "animado", "slide": 3},
          {"nome": "Verso 2", "segundo": 20, "cena": "louvor", "modo": "lento", "slide": 6}]
with open(ponte.CAMINHO_MARCAS, "w", encoding="utf-8") as arquivo:
    json.dump({"avante": MARCAS}, arquivo)

ponte._config = ponte.carregar_config()
ponte._contexto = ponte.montar_contexto(ponte._config)
OBS = simulados.ObsSimulado()
HOLYRICS = simulados.HolyricsSimulado()
ponte._contexto["obs"] = ponte._contexto["obs_saude"] = OBS
ponte._contexto["holyrics"] = ponte._contexto["holyrics_saude"] = HOLYRICS
ponte._cues_por_id = ponte.indexar_cues(ponte._config)
ponte._ordens_por_id = ponte.indexar_ordens(ponte._config)
ponte._retomar_ordem(ponte._config)
ponte._estado["obs"] = ponte._ler_estado_obs()
ponte._estado["holyrics"] = ponte._ler_estado_holyrics()
ponte._ao_vivo["valor"] = ponte._montar_ao_vivo()
cliente = ponte.app.test_client()


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


# As chaves que o painel.html antigo le. Esta lista e a de 12/11/2026 e NAO
# pode encolher: e o contrato com os PCs e com a web que ainda nao atualizaram.
CHAVES_ANTIGAS = {"maquina", "papel", "hora", "ordem", "ordens", "sistemas", "transmissao", "telao",
                  "luz", "controles", "recados", "tem_recado_limpar", "retorno_tv", "historico",
                  "remoto", "atualizacao", "maquinas"}

print("\nO retrato so cresce")
r = cliente.get("/api/painel").get_json()
conferir("todas as chaves antigas continuam la", CHAVES_ANTIGAS <= set(r), CHAVES_ANTIGAS - set(r))
conferir("a ordem tem as chaves de sempre",
         {"id", "nome", "versao", "atual", "atual_id", "proximo_id", "momentos"} <= set(r["ordem"]))
conferir("a transmissao tem as chaves de sempre",
         {"imagem", "preparada", "no_ar", "gravando", "tempo_ms", "youtube"} <= set(r["transmissao"]))
conferir("a luz tem as chaves de sempre", {"cena", "cenas", "modo", "modos"} <= set(r["luz"]))
conferir("o telao tem as chaves de sempre", {"vazio", "nome", "slide", "total", "preta"} <= set(r["telao"]))
conferir("e anuncia que e o retrato novo", r["versao_do_painel"] == 2 and r["local"] is True)
conferir("as partes novas vieram",
         all(k in r for k in ("agenda", "equipamentos", "louvor", "conteudo_versao", "imagem", "internet")))
conferir("a faixa de simulacao esta ligada", r["simulacao"] is True)

print("\nTransmissao")
cenas = [c["nome"] for c in r["transmissao"]["cenas"]]
conferir("as cenas vem na ordem do OBS, sem o numero", cenas[:3] == ["Abertura", "Louvor", "Pregação"], cenas)
conferir("a que esta no ar vem marcada", [c["no_ar"] for c in r["transmissao"]["cenas"]][:2] == [True, False])
conferir("os numeros existem mesmo fora do ar",
         r["transmissao"]["numeros"]["disco_gb"] == 212 and r["transmissao"]["numeros"]["qualidade"]["palavra"] is None,
         r["transmissao"]["numeros"])
corpo, codigo = acao({"tipo": "cena_transmissao", "cena": "2. Louvor"})
conferir("trocar de cena poe no ar na hora", codigo == 200 and OBS.no_ar == "2. Louvor"
         and corpo["titulo"] == "Imagem no ar: Louvor", corpo)
corpo, codigo = acao({"tipo": "cena_transmissao", "cena": "Cena inventada"})
conferir("cena que o OBS nao listou e recusada", codigo == 404 and OBS.no_ar == "2. Louvor", corpo)
corpo, codigo = acao({"tipo": "cena_transmissao", "cena": "3. Pregação"}, "web")
conferir("a web pode trocar de cena", codigo == 200 and OBS.no_ar == "3. Pregação", corpo)

print("\nClimas de luz")
luz = ponte._contexto["luzes"]
motor = ponte._contexto["movimento"]
conferir("os cinco climas estao no retrato",
         [c["id"] for c in r["luz"]["climas"]] == ["contemplativo", "adoracao", "crescendo", "celebracao", "explosao"])
corpo, codigo = acao({"tipo": "clima", "clima": "celebracao"})
conferir("clima aplica a cena e o movimento", codigo == 200 and corpo["titulo"] == "Luz: Celebração"
         and motor.atual() == "animado" and ponte._cena_de_luz_atual() == "celebracao",
         (corpo, motor.atual(), ponte._cena_de_luz_atual()))
r = cliente.get("/api/painel").get_json()
conferir("o retrato marca o clima ativo", [c["id"] for c in r["luz"]["climas"] if c["ativo"]] == ["celebracao"],
         r["luz"]["climas"])
conferir("clima que nao existe e recusado", acao({"tipo": "clima", "clima": "estrobo"})[1] == 404)
conferir("a web pode pedir um clima", acao({"tipo": "clima", "clima": "adoracao"}, "web")[1] == 200
         and motor.atual() == "lento")
ponte._config["climas"] = {"explosao": {"cena": "celebracao", "modo": "estrobo"}}
corpo, codigo = acao({"tipo": "clima", "clima": "explosao"})
conferir("clima apontando para movimento perigoso fica indisponivel", codigo == 409 and "falta configurar" in corpo["erro"], corpo)
del ponte._config["climas"]

print("\nLista fechada de acoes")
conferir("acao desconhecida e recusada", acao({"tipo": "rodar_qualquer_coisa"})[1] == 400)
conferir("acao sem tipo e recusada", acao({})[1] == 400 and acao(None)[1] == 400)
for tipo in ("louvor_assumir", "louvor_devolver", "louvor_segurar", "louvor_slide", "louvor_parte",
             "louvor_repetir_refrao", "louvor_musica", "louvor_comecou", "louvor_acertar", "luz_seguir", "imagem"):
    corpo, codigo = acao({"tipo": tipo, "para": "proxima"}, "web")
    conferir("pela web, '{}' e recusada".format(tipo), codigo == 403, (codigo, corpo))
conferir("pela web nada foi tocado", HOLYRICS.musica is None)
conferir("toda acao nova da web esta na lista geral", set(painel_ao_vivo.ACOES_DA_WEB) <= set(painel_ao_vivo.ACOES))
ponte._remoto["aceita"] = False
conferir("com 'So mostra', a web nao troca nem a cena", acao({"tipo": "cena_transmissao", "cena": "1. Abertura"}, "web")[1] == 403)
ponte._remoto["aceita"] = True

print("\nLouvor pelo painel")
r = cliente.get("/api/painel").get_json()
conferir("a musica com marcas e pronta; as outras, a mao",
         [(m["id"], m["pronta"]) for m in r["louvor"]["lista"]][:2] == [("avante", True), ("sou_grato", False)], r["louvor"]["lista"])
conteudo = cliente.get("/api/painel/conteudo").get_json()
conferir("o conteudo traz a letra, e a versao bate com a do retrato",
         conteudo["versao"] == r["conteudo_versao"] and conteudo["musicas"][0]["slides"][0]["linhas"], conteudo["versao"])
conferir("a letra NAO viaja no retrato de rotina", '"slides"' not in json.dumps(r["louvor"]) and "linhas" not in json.dumps(r))
corpo, codigo = acao({"tipo": "louvor_musica", "para": "proxima"})
conferir("escolher a musica poe a letra no telao", codigo == 200 and HOLYRICS.musica == "1741522267781" and HOLYRICS.slide == 0, corpo)
historico = len(ponte._historico)
corpo, codigo = acao({"tipo": "louvor_slide", "para": "proximo", "visto": 0, "quem": "Celular"})
conferir("passar slide chega ao Holyrics", codigo == 200 and HOLYRICS.slide == 1, (corpo, HOLYRICS.slide))
conferir("e nao enche o 'Aconteceu agora'", len(ponte._historico) == historico)
conferir("o segundo toque no mesmo slide nao anda duas vezes",
         acao({"tipo": "louvor_slide", "para": "proximo", "visto": 0, "quem": "PC"})[1] == 409 and HOLYRICS.slide == 1)
r = cliente.get("/api/painel").get_json()
conferir("o retrato diz quem esta no comando", r["louvor"]["quem"] == "Celular" and r["louvor"]["letra"] == "na_mao")
resposta = cliente.post("/api/relogio", json={"fonte": "navegador", "musica": "avante", "posicao": 12.0, "tocando": True})
conferir("a rota do relogio aceita a fonte escolhida", resposta.get_json() == {"aceito": True})
resposta = cliente.post("/api/relogio", json={"fonte": "reaper", "musica": "avante", "posicao": 99.0, "tocando": True})
conferir("e ignora a fonte que nao e a escolhida", resposta.get_json() == {"aceito": False})
corpo, codigo = acao({"tipo": "louvor_devolver", "quem": "PC do telão"})
conferir("devolver volta a seguir o relogio", codigo == 200 and HOLYRICS.slide == 3, (corpo, HOLYRICS.slide))
conferir("e fica anotado com o nome do aparelho", ponte._historico[0]["titulo"] == "PC do telão devolveu a letra", ponte._historico[0])
acao({"tipo": "clima", "clima": "contemplativo"})
r = cliente.get("/api/painel").get_json()
conferir("mexer no clima durante a musica poe a luz na mao", r["louvor"]["luz"] == "na_mao" and r["luz"]["seguindo"] is False)
conferir("e a letra continua sozinha", r["louvor"]["letra"] == "sozinho")
conferir("'Seguir a musica' devolve a luz", acao({"tipo": "luz_seguir"})[1] == 200
         and cliente.get("/api/painel").get_json()["luz"]["seguindo"] is True)
conferir("a musica ficou guardada para o caso de a ponte reiniciar", ponte._louvor_lembrado() == "avante")

print("\nHorarios")
r = cliente.get("/api/painel").get_json()
conferir("sem a hora do culto: a agenda vem, sem horarios",
         len(r["agenda"]["momentos"]) == len(r["ordem"]["momentos"]) and r["agenda"]["texto"] is None)
acao({"tipo": "ir", "momento": "louvor"})
conferir("entrar num momento guarda a hora de entrada", "louvor" in ponte._ordem["entradas"])
with open(ponte.CAMINHO_PONTEIRO, encoding="utf-8") as arquivo:
    conferir("e ela vai para o arquivo do ponteiro", "louvor" in json.load(arquivo)["entradas"])
conferir("no momento do louvor, o retrato avisa a tela", cliente.get("/api/painel").get_json()["louvor"]["no_momento"] is True)

acao({"tipo": "louvor_comecou"})
acao({"tipo": "ir", "momento": "avisos"})
r = cliente.get("/api/painel").get_json()
conferir("sair do momento do louvor encerra a musica", r["louvor"]["musica"] is None and r["louvor"]["no_momento"] is False, r["louvor"]["musica"])
conferir("e fica anotado", any(f["titulo"] == "Louvor encerrado" for f in ponte._historico))
luzes = motor.atual()
ponte._pecas["relogio"].avisar("navegador", "avante", 11.0, True)
ponte._pecas["condutor"].passo()
conferir("depois disso o relogio nao mexe mais na luz", motor.atual() == luzes)

conferir("ponte reiniciada fora do louvor: nao retoma a musica", ponte._lembrar_se_ainda_e_louvor(ponte._ao_vivo["valor"]) is None)
ponte._guardar_louvor("avante")
acao({"tipo": "ir", "momento": "louvor"})
conferir("reiniciada no meio do louvor: retoma", ponte._lembrar_se_ainda_e_louvor(ponte._ao_vivo["valor"]) == "avante")

print("\nImagem do OBS")


class Tempo:
    t = 10.0

    def __call__(self):
        return self.t


tempo = Tempo()
imagem = obs_imagem.ImagemDoOBS(OBS, lambda: OBS.no_ar, agora=tempo)
pedidos = [imagem.pegar() for _ in range(5)]
conferir("cinco telas pedindo: uma captura so", imagem.capturas == 1 and all(p[0] for p in pedidos), imagem.capturas)
conferir("e uma imagem de verdade (PNG do simulador)", pedidos[0][0][:4] == b"\x89PNG" and pedidos[0][1] == "image/png")
tempo.t += 1.1
imagem.pegar()
conferir("passado o intervalo, captura de novo", imagem.capturas == 2)
imagem.ativo = False
conferir("desligada nao captura", imagem.pegar()[0] is None and imagem.capturas == 2)
imagem.ativo = True
tempo.t += 5
OBS_QUEBRADO = type("Q", (), {"pedir": lambda self, *a: (_ for _ in ()).throw(RuntimeError("fora"))})()
quebrada = obs_imagem.ImagemDoOBS(OBS_QUEBRADO, lambda: "x", agora=tempo)
conferir("OBS fora do ar: sem imagem, sem estourar", quebrada.pegar()[0] is None)
resposta = cliente.get("/api/painel/imagem")
conferir("a rota entrega a imagem, sem guardar em cache",
         resposta.status_code == 200 and resposta.headers["Cache-Control"] == "no-store" and resposta.data[:4] == b"\x89PNG")
corpo, codigo = acao({"tipo": "imagem", "mostrar": False})
conferir("desligar pelo painel", codigo == 200 and cliente.get("/api/painel/imagem").status_code == 204
         and cliente.get("/api/painel").get_json()["imagem"]["ativa"] is False)
acao({"tipo": "imagem", "mostrar": True})

print("\nViradas de estado no 'Aconteceu agora'")
ao_vivo = ponte._ao_vivo["valor"]
antes = len(ponte._historico)
ok = [{"nome": "Transmissão", "estado": "ok", "detalhe": ""}]
caiu = [{"nome": "Transmissão", "estado": "erro", "detalhe": "o OBS não responde."}]
ao_vivo.vigiar_viradas(ok)
ao_vivo.vigiar_viradas(ok)
conferir("sem mudanca, nada e anotado", len(ponte._historico) == antes)
ao_vivo.vigiar_viradas(caiu)
ao_vivo.vigiar_viradas(caiu)
ao_vivo.vigiar_viradas(caiu)
conferir("caiu: anota uma vez so", len(ponte._historico) == antes + 1 and ponte._historico[0]["titulo"] == "O OBS parou de responder")
ao_vivo.vigiar_viradas(ok)
conferir("voltou: anota", ponte._historico[0]["titulo"] == "O OBS voltou" and ponte._historico[0]["ok"] is True)

print("\nInternet")
falso = painel_ao_vivo.PainelAoVivo({"espelho": lambda: None, "saude": ponte._saude_do_envio, "agora": lambda: 1000.0})
conferir("sem a web e sem transmissao: nao ha como saber", falso.internet() is None)
for espelho, esperado in (({"ok": True, "em": 999.0, "ms": 300}, "boa"), ({"ok": True, "em": 999.0, "ms": 2100}, "lenta"),
                          ({"ok": False, "em": 990.0, "ms": None}, "lenta"), ({"ok": False, "em": 900.0, "ms": None}, "caiu"),
                          ({"ok": False, "em": None, "ms": None}, "caiu")):
    p = painel_ao_vivo.PainelAoVivo({"espelho": lambda e=espelho: e, "agora": lambda: 1000.0})
    conferir("espelho {} -> internet {}".format(espelho, esperado), p.internet()["estado"] == esperado, p.internet())

print("\nO pacote e as telas")
for nome in ("ao-vivo.html", "ao-vivo.css", "ao-vivo.js", "painel.html"):
    conferir("'{}' esta no pacote e existe".format(nome), nome in ponte.PACOTE and os.path.exists(os.path.join(AQUI, nome)))
pagina = cliente.get("/")
conferir("a raiz serve a tela nova", pagina.status_code == 200 and b"ao-vivo.js" in pagina.data)
pagina.close()
antiga = cliente.get("/painel-antigo")
conferir("o painel antigo continua em /painel-antigo", antiga.status_code == 200 and b"ao-vivo.js" not in antiga.data)
antiga.close()
for caminho in ("/ao-vivo.css", "/ao-vivo.js"):
    resposta = cliente.get(caminho)
    conferir("a rota {} existe".format(caminho), resposta.status_code == 200)
    resposta.close()
for nome in ("ao-vivo.html", "ao-vivo.js"):
    with open(os.path.join(AQUI, nome), encoding="utf-8") as arquivo:
        texto = arquivo.read().lower()
    for palavra in ("cue", "preset", "dmx", "bitrate", "stream"):
        import re
        conferir("'{}' nao aparece em {}".format(palavra, nome), not re.search(r"\b" + palavra + r"s?\b", texto))

print("\nA versao web")
sys.path.insert(0, os.path.join(AQUI, "..", "web"))
import importlib.util   # noqa: E402

espec = importlib.util.spec_from_file_location("ponte_web", os.path.join(AQUI, "..", "web", "app.py"))
web = importlib.util.module_from_spec(espec)
espec.loader.exec_module(web)
navegador = web.app.test_client()
with navegador.session_transaction() as sessao:
    sessao["ok"] = True
CHAVE = {"X-Ponte-Chave": os.environ["PONTE_CHAVE"]}
chegada = {"passos": []}


def serve(caminho):
    resposta = navegador.get(caminho)
    dados = resposta.data
    resposta.close()
    return dados


conferir("igreja que ainda nao ligou: tela antiga", b"ao-vivo.js" not in serve("/painel"))
navegador.post("/api/espelho", headers=CHAVE, json={"chegada": chegada, "painel": {"ordem": {}, "remoto": {"aceita": True}}})
conferir("igreja com codigo antigo (retrato sem versao): tela antiga", b"ao-vivo.js" not in serve("/painel"))
retrato = cliente.get("/api/painel").get_json()
resposta = navegador.post("/api/espelho", headers=CHAVE, json={"chegada": chegada, "painel": retrato}).get_json()
conferir("igreja nova: tela nova", b"ao-vivo.js" in serve("/painel"))
conferir("a web pede o conteudo que ainda nao tem", resposta["quer_conteudo"] is True, resposta)
resposta = navegador.post("/api/espelho", headers=CHAVE,
                          json={"chegada": chegada, "painel": retrato, "conteudo": conteudo}).get_json()
conferir("recebido, para de pedir", resposta["quer_conteudo"] is False)
conferir("e serve o conteudo para a tela", navegador.get("/api/painel/conteudo").get_json()["versao"] == conteudo["versao"])
conferir("a web nao tem imagem", navegador.get("/api/painel/imagem").status_code == 204)
conferir("o painel antigo continua acessivel na web", b"ao-vivo.js" not in serve("/painel-antigo"))
conferir("a web aceita pedir clima", navegador.post("/api/painel/acao", json={"tipo": "clima", "clima": "adoracao"}).status_code == 200)
conferir("a web recusa passar slide", navegador.post("/api/painel/acao", json={"tipo": "louvor_slide", "para": "proximo"}).status_code == 400)
resposta = navegador.post("/api/espelho", headers=CHAVE, json={"chegada": chegada, "painel": retrato}).get_json()
conferir("o pedido de clima chega a igreja na volta seguinte",
         resposta["comandos"] == [{"tipo": "painel", "passo": None, "corpo": {"tipo": "clima", "clima": "adoracao"}}], resposta["comandos"])
conferir("sem a senha, a tela nova nao abre", web.app.test_client().get("/painel").status_code == 302)

print("\nO espelho so manda a letra quando muda")
from ponte import espelho as mod_espelho   # noqa: E402

enviados = []


class Resposta:
    def __init__(self, corpo):
        self._corpo = corpo

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return json.dumps(self._corpo).encode()


quer = [False]


def urlopen_falso(pedido, timeout=None):
    enviados.append(json.loads(pedido.data.decode()))
    return Resposta({"comandos": [], "quer_conteudo": quer[0]})


mod_espelho.urllib.request.urlopen = urlopen_falso
versao = ["v1"]
e = mod_espelho.Espelho("http://web", "chave", lambda: chegada, lambda c: None, extra=lambda: {"painel": {}},
                        conteudo=lambda: (versao[0], {"versao": versao[0], "musicas": []}))
e._uma_volta()
e._uma_volta()
conferir("vai na primeira volta e nao na segunda", "conteudo" in enviados[0] and "conteudo" not in enviados[1])
versao[0] = "v2"
e._uma_volta()
conferir("vai de novo quando a versao muda", enviados[2].get("conteudo", {}).get("versao") == "v2")
quer[0] = True
e._uma_volta()
quer[0] = False
e._uma_volta()
conferir("e quando a web diz que nao tem", "conteudo" not in enviados[3] and "conteudo" in enviados[4])
antigo = mod_espelho.Espelho("http://web", "chave", lambda: chegada, lambda c: None)
antigo._uma_volta()
conferir("sem conteudo configurado, o espelho funciona como antes", set(enviados[-1]) == {"maquina", "chegada"})

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
