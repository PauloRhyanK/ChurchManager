"""Testes das imagens dos slides da palavra. Rodam sem Holyrics e sem internet:

    python _testar_slides_da_palavra.py

A primeira metade testa ponte/slides_da_palavra.py sozinho, com uma pasta
temporaria no lugar da pasta de imagens do Holyrics e um "baixar" de mentira.
A segunda sobe o app.py DENTRO do teste, com o Holyrics de mentira (que recusa
com "file not allowed" o que nao existe na pasta, como o de verdade), e
confere o botao "Abrir os slides da Palavra" e o passar dos slides.
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

from ponte import palavra as mod_palavra            # noqa: E402
from ponte import slides_da_palavra as mod          # noqa: E402
from ponte import simulados                         # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


def entrega(versao, quantos=3, com_imagem=True):
    """Um `services/next` de exemplo, como o ChurchManager vai mandar."""
    slides = []
    for i in range(quantos):
        slide = {"index": i, "kind": "VERSE" if i == 1 else "POINT", "title": "Slide {}".format(i + 1),
                 "text": "Texto do slide {}".format(i + 1), "reference": "João 8:12" if i == 1 else None,
                 "width": 1920, "height": 1080}
        if com_imagem:
            slide["imageUrl"] = "https://api.exemplo.com.br/sermons/s1/slides/{}-{}.png".format(versao, i)
        slides.append(slide)
    return {"service": {"id": "c1"}, "sermon": {"title": "Luz que não se apaga", "preacherName": "Pr. Fulano",
                                               "version": versao, "slides": slides}}


PNG = simulados.imagem_de_slide("x")
JPG = b"\xff\xd8\xff\xe0" + b"0" * 64

print("\nO formato novo da palavra")
p = mod_palavra.normalizar(entrega("v1")["sermon"])
conferir("o slide guarda o endereco da imagem", p["slides"][0]["imagem_url"].endswith("v1-0.png"))
conferir("e o titulo", p["slides"][0]["titulo"] == "Slide 1")
conferir("a versao muda quando o ChurchManager diz que mudou",
         p["versao"] != mod_palavra.normalizar(entrega("v2")["sermon"])["versao"])
so_imagem = mod_palavra.normalizar({"title": "x", "slides": [{"kind": "IMAGE", "imageUrl": "https://a/b.png"}]})
conferir("slide que so tem imagem entra", len(so_imagem["slides"]) == 1)
ruim = mod_palavra.normalizar({"title": "x", "slides": [{"kind": "POINT", "text": "a", "imageUrl": "file:///c:/x.png"}]})
conferir("endereco que nao e da internet e ignorado", ruim["slides"][0]["imagem_url"] is None)
conferir("sem imageUrl, tudo como antes", mod_palavra.normalizar(entrega("v1", com_imagem=False)["sermon"])["slides"][0]["imagem_url"] is None)

print("\nTrazer as imagens para a pasta do Holyrics")
DISCO = os.path.join(PASTA, "image")
os.makedirs(os.path.join(DISCO, "Palavra"))
with open(os.path.join(DISCO, "Palavra", "posta-a-mao.jpg"), "wb") as arquivo:
    arquivo.write(JPG)
estado = {"palavra": None, "pasta": DISCO, "falhar": None, "baixados": [], "agora": 1000.0}
notas = []


def baixar(url):
    estado["baixados"].append(url)
    if estado["falhar"] and estado["falhar"] in url:
        raise RuntimeError("o servidor das imagens respondeu 503")
    return JPG if url.endswith("-2.png") else PNG


def novo():
    return mod.SlidesDaPalavra(lambda: estado["palavra"], lambda: estado["pasta"], "Palavra",
                               os.path.join(PASTA, "_lista.json"), baixar,
                               lambda titulo, ok, detalhe: notas.append((titulo, ok, detalhe)),
                               agora=lambda: estado["agora"])


def na_pasta():
    return sorted(os.listdir(os.path.join(DISCO, "Palavra")))


s = novo()
s.passo()
conferir("sem palavra: diz que nao ha", s.retrato()["estado"] == "sem_palavra")
estado["palavra"] = mod_palavra.normalizar(entrega("v1", com_imagem=False)["sermon"])
s.passo()
conferir("palavra sem imagens: os slides vao como texto", s.retrato()["estado"] == "sem_imagens" and not estado["baixados"])

estado["palavra"] = v1 = mod_palavra.normalizar(entrega("v1")["sermon"])
estado["pasta"] = None
s.passo()
conferir("sem a pasta do Holyrics: avisa e nao baixa", s.retrato()["estado"] == "sem_pasta" and not estado["baixados"])
estado["pasta"] = DISCO
s.passo()
r = s.retrato()
conferir("baixou as tres e ficou pronto", (r["estado"], r["quantos"], r["texto"]) == ("prontos", 3, "Slides da Palavra prontos (3)"), r)
arquivos = na_pasta()
conferir("os arquivos estao na subpasta, numerados", [a[:2] for a in arquivos if a != "posta-a-mao.jpg"] == ["01", "02", "03"], arquivos)
conferir("a extensao sai do conteudo (o terceiro e JPEG)", s.arquivo(v1["versao"], 2).endswith(".jpg") and s.arquivo(v1["versao"], 0).endswith(".png"))
conferir("o nome para o Holyrics e pasta/arquivo", s.arquivo(v1["versao"], 0) == "Palavra/" + arquivos[0], s.arquivo(v1["versao"], 0))
conferir("anotou no historico", notas[-1][0] == "Slides da Palavra prontos (3)" and notas[-1][1] is True)
quantos = len(estado["baixados"])
s.passo()
conferir("com a mesma versao nao baixa de novo", len(estado["baixados"]) == quantos)
conferir("imagem de outra versao: nao ha", s.arquivo("outra", 0) is None)

print("\nA palavra mudou")
estado["palavra"] = v2 = mod_palavra.normalizar(entrega("v2", quantos=2)["sermon"])
estado["falhar"] = "v2-1"
s.passo()
conferir("uma imagem falhou: nada muda na pasta", na_pasta() == arquivos and s.retrato()["estado"] == "erro", s.retrato())
conferir("e a palavra nova vai como texto", s.arquivo(v2["versao"], 0) is None)
conferir("o motivo aparece", "503" in s.retrato()["motivo"] and notas[-1][1] is False)
quantos = len(estado["baixados"])
s.passo()
conferir("nao martela o servidor: espera um minuto", len(estado["baixados"]) == quantos)
estado["falhar"], estado["agora"] = None, estado["agora"] + 61
s.passo()
depois = na_pasta()
conferir("depois do minuto, tenta de novo e fica pronto", s.retrato()["quantos"] == 2, s.retrato())
conferir("as imagens da versao anterior foram apagadas", len(depois) == 3 and not set(arquivos) - {"posta-a-mao.jpg"} & set(depois), depois)
conferir("o que alguem pos a mao na pasta fica", "posta-a-mao.jpg" in depois)

print("\nDepois de fechar e abrir a Ponte")
outro = novo()
quantos = len(estado["baixados"])
outro.passo()
conferir("lembra do que ja baixou", outro.retrato()["estado"] == "prontos" and len(estado["baixados"]) == quantos)
os.remove(os.path.join(DISCO, "Palavra", depois[0]))
outro.passo()
conferir("se alguem apagou uma imagem, baixa de novo", len(estado["baixados"]) > quantos and outro.retrato()["estado"] == "prontos")
conferir("o que nao e imagem nao entra na pasta", mod.extensao(b"<html>erro</html>") is None)

print("\nOnde fica a pasta de imagens do Holyrics")
conferir("vale o que esta escrito no config", mod.pasta_de_imagens_do_holyrics({"palavra": {"pasta_no_disco": DISCO}}) == DISCO)
conferir("caminho escrito que nao existe: None", mod.pasta_de_imagens_do_holyrics({"palavra": {"pasta_no_disco": os.path.join(PASTA, "nao")}}) is None)
base = os.path.join(PASTA, "inst")
os.makedirs(os.path.join(base, "Holyrics", "files", "media", "image"))


class Cliente:
    def pedir(self, acao, dados=None):
        return {"status": "ok", "data": {"version": "2.24.0", "baseDir": base}}


conferir("sem config, pergunta ao Holyrics onde ele esta instalado",
         mod.pasta_de_imagens_do_holyrics({}, Cliente()) == os.path.join(base, "Holyrics", "files", "media", "image"))

print("\nO telao: imagem primeiro, texto de reserva")
holy = simulados.HolyricsSimulado()
holy.pasta_de_imagens = DISCO
telao = mod_palavra.TelaoDaPalavra(lambda: holy, lambda: {}, lambda slide: "Palavra/nao-existe.png" if slide["indice"] == 0 else None)
telao.mostrar(v1["slides"][0])
conferir("o Holyrics recusou a imagem: foi o texto", holy.historico[-1][0] == "ShowQuickPresentation", holy.historico[-2:])
conferir("e o aviso explica, sem 'file not allowed'", "não achou" in (telao.aviso or "") and "not allowed" not in telao.aviso, telao.aviso)
telao.mostrar(v1["slides"][1])
conferir("imagem que ainda nao chegou: versiculo pela referencia, com aviso", holy.historico[-1][0] == "ShowVerse" and telao.aviso)
sem = mod_palavra.normalizar(entrega("v1", com_imagem=False)["sermon"])
telao.mostrar(sem["slides"][2])
conferir("palavra sem imagem: texto, sem aviso nenhum", telao.aviso is None)

print("\nO caminho inteiro, no app")
caminho = os.path.join(PASTA, "_palavra_do_dia.json")
import app as ponte          # noqa: E402

ponte.CAMINHO_PALAVRA = caminho
HOLY = simulados.HolyricsSimulado()
ponte._config = ponte.carregar_config()
ponte._contexto = ponte.montar_contexto(ponte._config)
ponte._contexto["obs"] = ponte._contexto["obs_saude"] = simulados.ObsSimulado()
ponte._contexto["holyrics"] = ponte._contexto["holyrics_saude"] = HOLY
ponte._cues_por_id = ponte.indexar_cues(ponte._config)
ponte._ordens_por_id = ponte.indexar_ordens(ponte._config)
ponte._retomar_ordem(ponte._config)
ponte._estado["obs"] = ponte._ler_estado_obs()
ponte._ao_vivo["valor"] = ponte._montar_ao_vivo()
slides = ponte._pecas["slides_da_palavra"]


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


def gravar(dados):
    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo)


corpo, codigo = acao({"tipo": "slides_palavra"})
conferir("sem palavra: o botao diz o que falta, em portugues", codigo == 409 and "não há slides da Palavra" in corpo["erro"], corpo)

gravar(entrega("v1", com_imagem=False))
corpo, codigo = acao({"tipo": "slides_palavra"})
conferir("palavra sem imagens: o primeiro slide vai como texto", codigo == 200 and corpo["ok"] and HOLY.historico[-1][0] == "ShowQuickPresentation", (corpo, HOLY.historico[-1]))
conferir("nunca mais pede a pasta 'Pregação'", not [h for h in HOLY.historico if h[0] == "ShowImage"])

gravar(entrega("v3", quantos=4))
corpo, codigo = acao({"tipo": "slides_palavra"})
conferir("imagens ainda nao baixadas: vai como texto e diz por que", corpo["ok"] and "foi como texto" in corpo["detalhe"], corpo)
slides.passo()
palavra = ponte._pecas["palavra"].retrato()
conferir("o retrato leva o estado das imagens", palavra["imagens"]["texto"] == "Slides da Palavra prontos (4)", palavra["imagens"])
corpo, codigo = acao({"tipo": "slides_palavra"})
ultimo = HOLY.historico[-1]
conferir("com as imagens prontas, o botao mostra a primeira de verdade",
         corpo["ok"] and corpo["detalhe"] == "tudo certo" and ultimo[0] == "ShowImage" and ultimo[1]["file"].startswith("Palavra/01-"), (corpo, ultimo))
conferir("o Holyrics simulado achou o arquivo", HOLY.imagem == ultimo[1]["file"])
corpo, codigo = acao({"tipo": "palavra_slide", "para": "proximo", "visto": 0})
conferir("'Proximo' do painel passa para a segunda imagem", HOLY.historico[-1][1].get("file", "").startswith("Palavra/02-"), HOLY.historico[-1])
ponte._ao_vivo["valor"].passar("proximo", "Passador")
conferir("o passador (e o celular do pregador) passam para a terceira", HOLY.historico[-1][1].get("file", "").startswith("Palavra/03-"), HOLY.historico[-1])
ponte._ao_vivo["valor"].passar("anterior", "Passador")
conferir("e voltam", HOLY.historico[-1][1].get("file", "").startswith("Palavra/02-"))
corpo, codigo = acao({"tipo": "slides_palavra"})
conferir("o botao, no meio da palavra, traz de volta o slide em que ela esta", HOLY.historico[-1][1].get("file", "").startswith("Palavra/02-"))

# A pasta sumiu do Holyrics (alguem apagou): o culto segue no texto.
for nome in os.listdir(os.path.join(HOLY.pasta_de_imagens, "Palavra")):
    os.remove(os.path.join(HOLY.pasta_de_imagens, "Palavra", nome))
corpo, codigo = acao({"tipo": "palavra_slide", "para": "proximo"})
conferir("imagem apagada por fora: o slide vai como texto, com aviso claro",
         corpo["ok"] and "não achou" in corpo["detalhe"] and HOLY.historico[-1][0] in ("ShowQuickPresentation", "ShowVerse"), corpo)
conferir("o aviso aparece no retrato", "não achou" in (ponte._pecas["palavra"].retrato()["aviso"] or ""))
conferir("o endereco do retrato nao leva caminho do disco", HOLY.pasta_de_imagens not in json.dumps(ponte._pecas["palavra"].retrato()))

print("\nFALHAS: {}".format(len(FALHAS)))
for nome in FALHAS:
    print("  - " + nome)
sys.exit(1 if FALHAS else 0)
