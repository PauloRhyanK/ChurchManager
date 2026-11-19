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

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
