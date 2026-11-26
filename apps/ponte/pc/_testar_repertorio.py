"""Testes do repertorio (as musicas do dia). Rodam sem Holyrics:

    python _testar_repertorio.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte import repertorio

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


CENAS = ["louvor", "celebracao", "oracao", "abertura"]
MODOS = ["respiro", "lento", "onda", "animado", "batida"]
TABELA = repertorio.tabela_de_climas({}, CENAS, MODOS)

print("\nClimas")
conferir("sao cinco, na ordem", [c["id"] for c in TABELA] == list(repertorio.CLIMAS))
conferir("com nome de gente", [c["nome"] for c in TABELA][1] == "Adoração")
conferir("todos disponiveis quando ha cena e movimento", all(c["disponivel"] for c in TABELA))
t2 = repertorio.tabela_de_climas({}, ["louvor"], MODOS)
conferir("sem a cena, o clima fica indisponivel",
         [c["disponivel"] for c in t2] == [False, True, True, False, False], t2)
t3 = repertorio.tabela_de_climas({"climas": {"explosao": {"cena": "abertura", "modo": "parado"}}}, CENAS, [])
conferir("o config troca o que o clima acende", t3[4]["cena"] == "abertura" and t3[4]["disponivel"], t3[4])
conferir("movimento que nao esta na lista (perigoso) deixa indisponivel", t3[0]["disponivel"] is False)
conferir("cena + movimento -> clima", repertorio.clima_de("celebracao", "batida", TABELA) == "explosao")
conferir("par que nao e clima nenhum", repertorio.clima_de("louvor", "pendulo", TABELA) is None)

print("\nAs cores de uma cena, para a tela mostrar a luz")
GRUPOS = {"cortina": {"bases": [49, 65], "brilho": 0, "paleta": [4, 5, 6, 7, 8]},
          "teto": {"bases": [113], "pan": 0, "tilt": 1, "paleta": [3, 4, 5, 6]},
          "barra": {"bases": [17, 33], "cores": [0, 1, 2, 3]}}
cores = repertorio.cores_da_cena({17: 128, 18: 0, 19: 0, 20: 0, 33: 128, 49: 255, 55: 255, 116: 0}, GRUPOS)
conferir("a barra vermelha a meia luz sai vermelha cheia",
         {"grupo": "barra", "cor": "#ff0000"} in cores, cores)
conferir("a cortina com brilho e azul sai azul", {"grupo": "cortina", "cor": "#0000ff"} in cores, cores)
conferir("grupo apagado fica de fora", [c["grupo"] for c in cores] == ["cortina", "barra"], cores)
conferir("cortina com cor e brilho zerado conta como apagada",
         repertorio.cores_da_cena({53: 255, 49: 0}, GRUPOS) == [])
conferir("branco soma nas tres cores", repertorio.cores_da_cena({"20": 200}, GRUPOS) == [{"grupo": "barra", "cor": "#ffffff"}])
conferir("cena de exemplo, fora do patch, nao da cor nenhuma", repertorio.cores_da_cena({1: 255, 2: 210}, GRUPOS) == [])
conferir("sem cena e sem grupos nao quebra", repertorio.cores_da_cena(None, None) == [])

print("\nTipo da parte, pelo nome que a banda usa")
for nome, tipo in (("Intro", "intro"), ("Verso 1 (solo)", "verso"), ("Pré-refrão", "pre_refrao"),
                   ("Refrão final", "refrao"), ("Ponte: cai", "ponte"), ("Instrumental", "instrumental"),
                   ("Final", "final"), ("Avante pelo Reino", "outra")):
    conferir("'{}' e {}".format(nome, tipo), repertorio.tipo_da_parte(nome) == tipo, repertorio.tipo_da_parte(nome))

LOUVOR = {"id": "luz", "nome": "LUZ DA MANHÃ", "holyrics_id": "111", "audio": "luz.mp3",
          "secoes": [{"nome": "Intro", "cena": "oracao", "modo": "respiro", "slide": 0},
                     {"nome": "Refrão", "cena": "celebracao", "modo": "animado", "slide": 2}]}
SLIDES = [{"text": "//Bateria: entra cheia\nANTES DO SOL NASCER\nTUA VOZ ME CHAMOU"},
          {"text": "NO SILÊNCIO DA CASA"},
          {"text": "//sobe a voz...\nÉS A LUZ DA MANHÃ"},
          {"text": "QUE NÃO VAI SE APAGAR"},
          {"text": "E EU SIGO ATRÁS"},
          {"text": "FIM"}]
MARCAS = [{"nome": "Refrão", "segundo": 20.0, "cena": "celebracao", "modo": "animado", "slide": 2},
          {"nome": "Verso 1", "segundo": 4.0, "cena": "louvor", "modo": "lento", "slide": 0},
          {"nome": "Refrão final", "segundo": 40.0, "cena": "celebracao", "modo": "batida", "slide": 2}]

print("\nMusica com marcas")
m = repertorio.montar_musica(LOUVOR, MARCAS, SLIDES, TABELA, duracao=60.0)
conferir("pronta", m["pronta"] is True)
conferir("partes em ordem de tempo, mesmo marcadas fora de ordem",
         [p["nome"] for p in m["partes"]] == ["Verso 1", "Refrão", "Refrão final"])
conferir("o clima sai da cena e do movimento",
         [p["clima"] for p in m["partes"]] == ["adoracao", "celebracao", "explosao"], [p["clima"] for p in m["partes"]])
conferir("o refrao que volta ao slide 2 nao fica sem slide", [p["quantos"] for p in m["partes"]] == [2, 1, 4],
         [p["quantos"] for p in m["partes"]])
conferir("a sequencia repete o slide do refrao", [s["indice"] for s in m["slides"]] == [0, 1, 2, 2, 3, 4, 5],
         [s["indice"] for s in m["slides"]])
conferir("o primeiro slide de cada parte tem o tempo marcado",
         [m["slides"][p["primeiro_slide"]]["tempo"] for p in m["partes"]] == [4.0, 20.0, 40.0])
conferir("os de dentro sao repartidos por igual, e ditos estimados",
         m["slides"][1]["tempo"] == 12.0 and m["slides"][1]["tempo_estimado"] is True
         and m["slides"][0]["tempo_estimado"] is False, m["slides"][1])
conferir("a ultima parte vai ate o fim do audio", [s["tempo"] for s in m["slides"][3:]] == [40.0, 45.0, 50.0, 55.0],
         [s["tempo"] for s in m["slides"][3:]])
conferir("tempos nunca andam para tras", all(a["tempo"] <= b["tempo"] for a, b in zip(m["slides"], m["slides"][1:])))
conferir("linha // vira instrucao, com destinatario", m["slides"][0]["instrucoes"] == [{"para": "Bateria", "texto": "entra cheia"}],
         m["slides"][0]["instrucoes"])
conferir("e sai da letra do telao", m["slides"][0]["linhas"] == ["ANTES DO SOL NASCER", "TUA VOZ ME CHAMOU"])
conferir("instrucao sem destinatario vai para a Banda", m["slides"][2]["instrucoes"] == [{"para": "Banda", "texto": "sobe a voz"}],
         m["slides"][2]["instrucoes"])
conferir("guarda titulo, id do Holyrics e audio", (m["titulo"], m["holyrics_id"], m["audio"]) == ("LUZ DA MANHÃ", "111", "luz.mp3"))
sem_fim = repertorio.montar_musica(LOUVOR, MARCAS, SLIDES, TABELA)
conferir("sem a duracao do audio: 4 s por slide na ultima parte", sem_fim["duracao"] == 56.0, sem_fim["duracao"])

print("\nMusica a mao")
m = repertorio.montar_musica(LOUVOR, [], SLIDES, TABELA)
conferir("sem marcas: nao e pronta", m["pronta"] is False)
conferir("as partes vem das secoes do config, sem tempo",
         [p["nome"] for p in m["partes"]] == ["Intro", "Refrão"] and all(p["tempo"] is None for p in m["partes"]))
conferir("os slides existem, sem tempo", len(m["slides"]) == 6 and all(s["tempo"] is None for s in m["slides"]))
m = repertorio.montar_musica(LOUVOR, [{"nome": "A", "segundo": "x", "slide": 0}], SLIDES, TABELA)
conferir("marca com tempo torto: a mao", m["pronta"] is False)
m = repertorio.montar_musica({"id": "nada"}, None, None, TABELA)
conferir("musica sem nada nao estoura", m["pronta"] is False and m["slides"] == [] and m["titulo"] == "nada")

print("\nSem o Holyrics")
m = repertorio.montar_musica(LOUVOR, MARCAS, None, TABELA)
conferir("entra sem texto, e sabe disso", m["tem_letra"] is False and all(s["linhas"] == [] for s in m["slides"]))
conferir("continua pronta e com os slides das marcas", m["pronta"] and [s["indice"] for s in m["slides"]] == [0, 1, 2, 2])

print("\nDuas partes no mesmo slide (o caso da 'avante')")
marcas = [{"nome": "Intro", "segundo": 0, "slide": 0}, {"nome": "Verso 1", "segundo": 13.7, "slide": 0},
          {"nome": "Pré-refrão", "segundo": 27.4, "slide": 2}]
m = repertorio.montar_musica(LOUVOR, marcas, SLIDES, TABELA)
conferir("nenhuma parte fica com zero slides", all(p["quantos"] >= 1 for p in m["partes"]), [p["quantos"] for p in m["partes"]])
conferir("a intro mostra o slide 0, e o verso volta a ele", [s["indice"] for s in m["slides"]][:3] == [0, 0, 1])
conferir("parte sem cena nao tem luz nem clima", m["partes"][0]["luz"] is None and m["partes"][0]["clima"] is None)

print("\nA fonte local")


class Tempo:
    t = 0.0

    def __call__(self):
        return self.t


tempo = Tempo()
lidas = []
holyrics_ligado = [False]


def ler_slides(hid):
    lidas.append(hid)
    if not holyrics_ligado[0]:
        raise RuntimeError("Holyrics fechado")
    return SLIDES


config = {"louvores": [LOUVOR, {"id": "b", "nome": "B"}, {"id": "c", "nome": "C"}, {"sem_id": 1}]}
fonte = repertorio.FonteLocal(config, lambda: {"luz": MARCAS}, ler_slides, lambda: TABELA, agora=tempo)
musicas = fonte.musicas()
conferir("todas as musicas do config, na ordem", [m["id"] for m in musicas] == ["luz", "b", "c"])
conferir("Holyrics fechado nao derruba: a musica entra sem letra", musicas[0]["tem_letra"] is False and musicas[0]["pronta"])
versao = fonte.versao()
fonte.musicas()
conferir("nao pergunta ao Holyrics a cada leitura", lidas == ["111"], lidas)
holyrics_ligado[0] = True
tempo.t = 61
conferir("depois de um minuto tenta ler a letra de novo", fonte.musicas()[0]["tem_letra"] is True and lidas == ["111", "111"])
conferir("e a versao do conteudo muda", fonte.versao() != versao and len(fonte.versao()) == 12)
tempo.t = 500
fonte.musicas()
conferir("com a letra lida, nao pergunta mais", lidas == ["111", "111"])
config["louvor_do_dia"] = ["c", "luz", "nao_existe"]
fonte.recarregar()
conferir("louvor_do_dia escolhe e ordena", [m["id"] for m in fonte.musicas()] == ["c", "luz"])
fonte = repertorio.FonteLocal({}, lambda: 1 / 0, ler_slides, lambda: TABELA)
conferir("config sem louvores e marcas ilegiveis: lista vazia", fonte.musicas() == [])

print("\nA fonte Cultos (pelo contrato; a rota de la ainda nao existe)")
RESPOSTA = {
    "service": {"id": "s1", "date": "2026-11-22", "startTime": "19:00", "name": "Domingo à noite",
                "moments": [{"name": "Louvor", "kind": "WORSHIP", "startsAt": "19:05", "durationMinutes": 17}]},
    "songs": [{
        "id": "c1", "title": "Luz da Manhã", "status": "READY", "musicalKey": "Sol", "bpm": 72,
        "audio": {"url": "https://exemplo/audio/x.mp3", "fileName": "luz.mp3", "durationSeconds": 252.4, "sizeBytes": 1},
        "parts": [{"index": 0, "kind": "VERSE", "name": "Verso 1", "mood": "WORSHIP", "time": 14.2, "firstSlide": 0, "slideCount": 1},
                  {"index": 1, "kind": "CHORUS", "name": "Refrão", "mood": "CELEBRATION", "time": 40.0, "firstSlide": 1, "slideCount": 1}],
        "slides": [{"index": 0, "part": 0, "time": 14.2, "lines": ["ANTES DO SOL NASCER", "TUA VOZ ME CHAMOU"],
                    "cues": [{"target": "VOCAL", "text": "solo, voz masculina"}]},
                   {"index": 1, "part": 1, "time": 40.0, "lines": ["ÉS A LUZ DA MANHÃ"], "cues": []}],
        "holyricsText": "..."},
        {"id": "c2", "title": "Canto Novo", "status": "NEEDS_TIMING", "audio": None,
         "parts": [{"index": 0, "kind": "VERSE", "name": "Verso 1", "mood": None, "time": None, "firstSlide": 0, "slideCount": 1}],
         "slides": [{"index": 0, "part": 0, "time": None, "lines": ["CANTAI"], "cues": []}]}],
    "sermon": {"title": "Luz que não se apaga", "preacherName": "Pr. Fulano",
               "slides": [{"index": 0, "kind": "VERSE", "text": "Eu sou a luz", "reference": "João 8:12"}]},
}
m = repertorio.musica_do_cultos(RESPOSTA["songs"][0], TABELA, lambda titulo: "999" if titulo == "Luz da Manhã" else None)
conferir("musica READY com todos os tempos e pronta", m["pronta"] and m["duracao"] == 252.4 and m["titulo"] == "Luz da Manhã")
conferir("o clima vira a chave da ponte, com a luz desta igreja",
         [p["clima"] for p in m["partes"]] == ["adoracao", "celebracao"] and m["partes"][1]["luz"] == {"cena": "celebracao", "modo": "animado"})
conferir("o tipo da parte vem do kind", [p["tipo"] for p in m["partes"]] == ["verso", "refrao"])
conferir("as instrucoes vem com destinatario em portugues", m["slides"][0]["instrucoes"] == [{"para": "Voz", "texto": "solo, voz masculina"}])
conferir("a letra vem pronta, sem depender do Holyrics", m["tem_letra"] and m["slides"][0]["linhas"][0] == "ANTES DO SOL NASCER")
conferir("o id do Holyrics e achado pelo titulo", m["holyrics_id"] == "999")
m2 = repertorio.musica_do_cultos(RESPOSTA["songs"][1], TABELA, lambda titulo: 1 / 0)
conferir("musica sem tempo: a mao, e a busca no Holyrics pode falhar sem derrubar", m2["pronta"] is False and m2["holyrics_id"] is None)
conferir("lixo nao estoura", repertorio.musica_do_cultos(None, TABELA)["slides"] == [])

import tempfile   # noqa: E402

guardado = os.path.join(tempfile.mkdtemp(), "_culto_do_dia.json")
rede = {"ok": True, "pedidos": 0}


def buscar():
    rede["pedidos"] += 1
    if not rede["ok"]:
        raise RuntimeError("sem internet, chave segredo-da-igreja recusada")
    return RESPOSTA


fonte = repertorio.FonteCultos("https://api.exemplo/", "igreja", "segredo-da-igreja", guardado, lambda: TABELA, buscar=buscar)
conferir("o endereco segue o contrato", fonte._endereco == "https://api.exemplo/api/public/tenants/igreja/worship/services/next")
conferir("url que ja termina em /api nao ganha outro", repertorio.FonteCultos(
    "http://localhost:3312/api", "demo", "k", guardado, lambda: TABELA)._endereco == "http://localhost:3312/api/public/tenants/demo/worship/services/next")
com_id = dict(RESPOSTA["songs"][0], holyricsId="1741522267781")
conferir("holyricsId da ficha vale mais que a busca pelo titulo",
         repertorio.musica_do_cultos(com_id, TABELA, lambda titulo: "999")["holyrics_id"] == "1741522267781")
vazia = repertorio.FonteCultos("https://api.exemplo", "igreja", "k", guardado + ".vazio", lambda: TABELA,
                               buscar=lambda: {"version": "vazio", "service": None, "sermon": None, "songs": []})
vazia.atualizar()
conferir("sem culto marcado: lista vazia, sem palavra, sem estourar", vazia.musicas() == [] and vazia.palavra() is None and vazia.culto() is None)
so_titulo = repertorio.FonteCultos("https://api.exemplo", "igreja", "k", guardado + ".t", lambda: TABELA,
                                   buscar=lambda: {"songs": [], "sermon": {"title": "Luz", "preacherName": "Pr. X", "estimatedMinutes": 35}})
so_titulo.atualizar()
conferir("palavra so com titulo (sem slides ainda) nao estoura",
         so_titulo.palavra()["titulo"] == "Luz" and so_titulo.palavra()["slides"] == [] and so_titulo.palavra()["minutos"] == 35)
conferir("antes de buscar: lista vazia, sem estourar", fonte.musicas() == [] and fonte.palavra() is None)
fonte.atualizar()
conferir("depois de buscar: as musicas do culto", [x["id"] for x in fonte.musicas()] == ["c1", "c2"] and len(fonte.versao()) == 12)
conferir("ler nao volta a rede", fonte.musicas() and rede["pedidos"] == 1)
conferir("a palavra do culto vem junto", fonte.palavra()["slides"][0]["referencia"] == "João 8:12")
conferir("e o culto, para os horarios", fonte.culto()["startTime"] == "19:00")
rede["ok"] = False
fonte.atualizar()
conferir("a internet caiu: continua com o que tinha", [x["id"] for x in fonte.musicas()] == ["c1", "c2"] and fonte.erro)
conferir("a chave nunca aparece na mensagem de erro", "segredo-da-igreja" not in fonte.erro, fonte.erro)
nova = repertorio.FonteCultos("https://api.exemplo", "igreja", "segredo-da-igreja", guardado, lambda: TABELA, buscar=buscar)
nova.atualizar()
conferir("ponte reiniciada sem internet: vale o que ficou no disco", [x["id"] for x in nova.musicas()] == ["c1", "c2"])

print("\nAchar a musica no acervo do Holyrics pelo titulo")
ACERVO = [
    {"id": "10", "title": "Jeová Jireh", "artist": "Aline Barros"},
    {"id": "11", "title": "Jeová Jireh", "artist": "Outro Ministério"},
    {"id": "20", "title": "Ele Vem", "artist": ""},
    {"id": "30", "title": "O Encontro - Ao Vivo", "artist": "Valesca"},
    {"title": "Sem id"},
]
achar = repertorio.achar_no_acervo
conferir("titulo igual, sem acento e sem caixa", achar(ACERVO, "jeova jireh") == "10")
conferir("o ' - artista' do ChurchManager acha pelo artista", achar(ACERVO, "Jeová Jireh - Aline Barros") == "10")
conferir("o artista desempata entre titulos iguais", achar(ACERVO, "Jeová Jireh - Outro Ministério") == "11")
conferir("so com o titulo base, sem artista no Holyrics", achar(ACERVO, "Ele Vem - Gabriel Guedes feat. Gabriela Rocha") == "20")
conferir("titulo com ' - ' no proprio Holyrics", achar(ACERVO, "O Encontro - Ao Vivo") == "30")
conferir("espacos a mais nao atrapalham", achar(ACERVO, "  Ele   Vem ") == "20")
conferir("nao achou: None", achar(ACERVO, "Outra Musica - Alguém") is None)
conferir("lixo nao estoura", achar(None, "x") is None and achar([None, 3], "") is None)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
