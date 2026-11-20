"""Testes do ciclo da TV do altar na janela do culto, e das telas do PC.
Rodam sem TV, sem Sunshine e sem Windows:

    python _testar_tv_e_telas.py

A TV e de mentira (ponte/simulados.py): liga, desliga, tem um aplicativo na
tela, e "conecta" escrevendo CLIENT CONNECTED num sunshine.log de exemplo. As
telas do PC tambem sao de mentira. O que NAO da para testar aqui esta no fim
da secao 18 de docs/PARA-A-SESSAO-DO-PC.md.
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

from ponte import simulados, telas, vigia_tv   # noqa: E402

FALHAS = []


def conferir(nome, condicao, detalhe=""):
    print("  {}  {}{}".format("OK    " if condicao else "FALHA ", nome, "  " + str(detalhe) if detalhe else ""))
    if not condicao:
        FALHAS.append(nome)


class Mundo:
    """Um vigia de verdade, com TV, Sunshine e relogio de mentira."""

    def __init__(self, conf=None, no_culto=True, com_ligar=True):
        self.t = 1_800_000_000.0
        self.tv = simulados.TvSimulada()
        self.no_culto = no_culto
        self.notas = []
        self.aberturas = 0
        self.vigia = vigia_tv.VigiaDaTV(
            dict(conf or {}, log=self.tv.log), ip_da_tv=self.tv.ip, na_tela=self.tv.na_tela, reabrir=self._abrir,
            relogio=lambda: self.t, dormir=self._dormir, registrar=lambda linha: None,
            janela_do_culto=lambda agora: self.no_culto, ligar=self.tv.ligar_pela_rede if com_ligar else None,
            anotar=lambda titulo, ok, detalhe: self.notas.append(titulo))

    def _abrir(self):
        self.aberturas += 1
        return self.tv.abrir_retorno()

    def _dormir(self, segundos):
        self.t += segundos

    def andar(self, segundos):
        fim = self.t + segundos
        while self.t < fim:
            self.t += 5
            self.vigia.olhar()
        return self.vigia.retrato()


print("\nLigar pela rede (o pacote)")
pacote = vigia_tv.pacote_de_ligar("64-CC-22-04-06-EC")
conferir("6 bytes FF e o MAC 16 vezes", pacote[:6] == b"\xff" * 6 and pacote[6:12] == bytes.fromhex("64cc220406ec") and len(pacote) == 102)
conferir("aceita o MAC com dois-pontos", vigia_tv.pacote_de_ligar("64:cc:22:04:06:ec") == pacote)
try:
    vigia_tv.pacote_de_ligar("nao-e-mac")
    conferir("MAC torto e recusado", False)
except ValueError:
    conferir("MAC torto e recusado", True)

print("\nNa janela do culto, com a TV desligada: fica olhando e manda ligar")
m = Mundo()
r = m.andar(5)
conferir("o estado e 'esperando a TV'", r["estado"] == "esperando_tv" and r["motivo"] == "mandando ligar pela rede", r)
conferir("manda ligar pela rede logo na primeira olhada", m.tv.pedidos_de_ligar == 1)
conferir("avisa o operador uma vez", m.notas == ["Esperando a TV do altar"], m.notas)
m.andar(600)
conferir("dez minutos depois continua olhando, SEM desistir", m.vigia.retrato()["estado"] == "esperando_tv" and m.vigia.retrato()["tentativas"] == 0)
conferir("e mandou ligar de 30 em 30 segundos, sem enxurrada", 19 <= m.tv.pedidos_de_ligar <= 22, m.tv.pedidos_de_ligar)
conferir("sem repetir o aviso no historico", m.notas == ["Esperando a TV do altar"], m.notas)
conferir("nenhuma tentativa de abrir com a TV fora da rede", m.aberturas == 0)

print("\nA TV aparece (alguem ligou no controle): o resto e sozinho")
m.tv.ligar()
r = m.andar(5)
conferir("percebe na olhada seguinte, e espera a TV assentar", r["estado"] == "abrindo" and m.aberturas == 0, r)
conferir("anota que a TV apareceu", m.notas[-1] == "TV apareceu na rede", m.notas)
r = m.andar(20)
conferir("abre o retorno sem ninguem ter aberto antes", m.aberturas == 1 and m.tv.app == vigia_tv.MOONLIGHT)
conferir("e so da por certo com o CLIENT CONNECTED do Sunshine", r["estado"] == "no_ar" and r["no_ar"] is True, r)
conferir("cada passo foi para o 'Aconteceu agora'",
         m.notas == ["Esperando a TV do altar", "TV apareceu na rede", "Abrindo o retorno na TV", "Retorno no ar na TV"], m.notas)
m.andar(300)
conferir("com o retorno no ar, nao mexe mais", m.aberturas == 1 and len(m.notas) == 4)

print("\nA TV acorda pelo 'ligar pela rede'")
m = Mundo()
m.tv.liga_pela_rede = True
r = m.andar(40)
conferir("o ciclo inteiro, sem ninguem tocar em nada", r["estado"] == "no_ar" and m.tv.pedidos_de_ligar == 1 and m.aberturas == 1, (r["estado"], m.notas))

print("\nA TV e desligada e religada no meio do culto")
m.tv.liga_pela_rede = False      # desta vez ela nao acorda pela rede: alguem tirou da tomada
m.tv.desligar()
r = m.andar(10)
conferir("percebe que a TV saiu", r["estado"] == "esperando_tv" and "A TV soltou o retorno" in m.notas, (r["estado"], m.notas))
m.andar(120)
m.tv.ligar()
r = m.andar(30)
conferir("religada: o ciclo se repete e o retorno volta", r["estado"] == "no_ar" and m.aberturas == 2, (r["estado"], m.aberturas))
conferir("com as anotacoes do segundo ciclo", m.notas[-3:] == ["TV apareceu na rede", "Reabrindo o retorno na TV", "Retorno no ar na TV"], m.notas[-4:])

print("\nO retorno cai com a TV ligada (o caso de 08/11)")
m = Mundo()
m.tv.ligar()
m.andar(30)
with open(m.tv.log, "ab") as arquivo:
    arquivo.write(b"[2026-11-22 19:40:00.000]: Info: CLIENT DISCONNECTED\n")
r = m.andar(10)
conferir("da 25 s para voltar sozinho antes de agir", r["estado"] == "caiu" and m.aberturas == 1, r)
r = m.andar(40)
conferir("e reabre", r["estado"] == "no_ar" and m.aberturas == 2)

print("\nOutro aplicativo na tela: nao mexe")
m = Mundo()
m.tv.ligar()
m.tv.app = "youtube.leanback.v4"
r = m.andar(60)
conferir("alguem esta usando a TV de proposito: o vigia nao abre nada", r["estado"] == "outro_app" and m.aberturas == 0 and r["motivo"] == "youtube.leanback.v4", r)
conferir("avisa uma vez", m.notas.count("Outro aplicativo na TV: não mexi") == 1, m.notas)
m.tv.app = "com.webos.app.livetv"
r = m.andar(60)
conferir("a tela inicial e a TV aberta NAO contam como alguem usando", r["estado"] == "no_ar" and m.aberturas == 1, r)
m = Mundo({"apps_livres": ["com.webos.app.hdmi2"]})
m.tv.ligar()
m.tv.app = "com.webos.app.hdmi2"
conferir("a lista de aplicativos livres e do config", m.andar(40)["estado"] == "no_ar")

print("\nA TV responde, mas o retorno nao conecta: ai sim ha limite")
m = Mundo()
m.tv.ligar()
m.tv.conecta = False
r = m.andar(600)
conferir("tres tentativas e para", m.aberturas == 3 and r["estado"] == "desistiu" and r["tentativas"] == 3, (m.aberturas, r))
conferir("pede uma pessoa, no historico", m.notas[-1] == "O retorno não abriu sozinho: abra pelo controle"
         and m.notas.count("A TV não conectou ao retorno (1 de 3)") == 1, m.notas)
m.andar(900)
conferir("e nao insiste", m.aberturas == 3)
m.tv.desligar()
m.andar(20)
m.tv.conecta = True
m.tv.ligar()
r = m.andar(40)
conferir("no proximo ciclo da TV (desligou e religou), tenta de novo", r["estado"] == "no_ar" and m.aberturas == 4, (r["estado"], m.aberturas))

print("\nFora da janela do culto: a regra antiga")
m = Mundo(no_culto=False)
r = m.andar(60)
conferir("TV desligada: nao manda ligar", r["estado"] == "tv_desligada" and m.tv.pedidos_de_ligar == 0, r)
m.tv.ligar()
r = m.andar(120)
conferir("TV ligada: nao abre o que ninguem abriu", r["estado"] == "fechado" and m.aberturas == 0 and r["na_janela"] is False, r)
conferir("e nao enche o historico", m.notas == [], m.notas)
m.no_culto = True
r = m.andar(40)
conferir("a janela do culto comecou: abre sozinho", r["estado"] == "no_ar" and m.aberturas == 1 and r["na_janela"] is True)
desligado = Mundo({"abrir_sozinho": False})
desligado.tv.ligar()
conferir("`abrir_sozinho: false` no config volta ao comportamento de antes", desligado.andar(120)["estado"] == "fechado" and desligado.aberturas == 0)
sem_wol = Mundo(com_ligar=False)
r = sem_wol.andar(60)
conferir("sem 'ligar pela rede': so espera, e diz para ligar no controle", r["estado"] == "esperando_tv" and r["motivo"] == "ligue a TV no controle")

print("\n'Tentar de novo' (o botao da chegada e do painel)")
m = Mundo(no_culto=False)
m.vigia.tentar_agora()
r = m.andar(10)
conferir("fora da janela, o botao faz o ciclo: manda ligar e espera", r["estado"] == "esperando_tv" and m.tv.pedidos_de_ligar >= 1, r)
m.tv.ligar()
r = m.andar(30)
conferir("a TV apareceu: abre e confirma", r["estado"] == "no_ar" and m.aberturas == 1)
conferir("fica anotado que foi a pedido", m.notas[0] == "Tentando abrir o retorno na TV, a pedido")
m = Mundo()
m.tv.ligar()
m.tv.conecta = False
m.andar(600)
m.tv.conecta = True
m.vigia.tentar_agora()
conferir("depois de o vigia desistir, o botao zera a conta e tenta ja", m.andar(15)["estado"] == "no_ar")
pausado = Mundo()
pausado.vigia.pausar(30)
pausado.tv.ligar()
conferir("pausado, nao abre nem na janela do culto", pausado.andar(120)["estado"] == "pausado" and pausado.aberturas == 0)

# ---------------------------------------------------------------------------
print("\nAs telas do PC: comparar")
BOA = simulados.TelasSimuladas.BOA
conferir("igual: nada a dizer", telas.comparar(BOA, [dict(t) for t in BOA]) == [])
sem = BOA[:1]
conferir("uma tela sumiu", telas.comparar(BOA, sem) == ["a tela Tela do retorno sumiu"], telas.comparar(BOA, sem))
outra = [dict(BOA[0]), dict(BOA[1], largura=1280, altura=720)]
conferir("resolucao trocada", telas.comparar(BOA, outra) == ["a tela Tela do retorno mudou de 1920x1080 para 1280x720"], telas.comparar(BOA, outra))
troca = [dict(BOA[0], principal=False), dict(BOA[1], principal=True)]
conferir("a principal trocou", telas.comparar(BOA, troca) == ["a tela Monitor do operador deixou de ser a principal", "a tela Tela do retorno virou a principal"])
lugar = [dict(BOA[0]), dict(BOA[1], x=-1920)]
conferir("uma tela mudou de lugar", telas.comparar(BOA, lugar) == ["a tela Tela do retorno mudou de lugar"])
nova = BOA + [{"nome": r"\\.\DISPLAY3", "monitor": "Projetor", "x": 3840, "y": 0, "largura": 1024, "altura": 768, "principal": False}]
conferir("apareceu uma tela nova", telas.comparar(BOA, nova) == ["apareceu uma tela nova (Projetor)"])
conferir("sem referencia ou sem leitura nao estoura", telas.comparar(None, BOA) and telas.comparar(BOA, None))

print("\nA tela que o Sunshine transmite")
conf = os.path.join(PASTA, "sunshine.conf")
with open(conf, "w", encoding="utf-8") as arquivo:
    arquivo.write("sunshine_name = PC\n# comentario\noutput_name = \\\\.\\DISPLAY2\nmin_log_level = info\n")
conferir("le o output_name do sunshine.conf", telas.saida_do_sunshine(conf) == r"\\.\DISPLAY2", telas.saida_do_sunshine(conf))
conferir("arquivo que nao existe: None", telas.saida_do_sunshine(os.path.join(PASTA, "nao.conf")) is None)
with open(conf + "2", "w", encoding="utf-8") as arquivo:
    arquivo.write("sunshine_name = PC\n")
conferir("sem output_name: vazio (o Sunshine usa a principal)", telas.saida_do_sunshine(conf + "2") == "")
conferir("a tela existe", telas.sunshine_tem_a_tela(r"\\.\DISPLAY2", BOA) is True)
conferir("a tela sumiu", telas.sunshine_tem_a_tela(r"\\.\DISPLAY2", BOA[:1]) is False)
conferir("o Sunshine novo escreve o id do monitor: tambem vale", telas.sunshine_tem_a_tela("{2}", BOA) is True)
conferir("sem nada escrito, sempre existe", telas.sunshine_tem_a_tela("", BOA[:1]) is True)
conferir("sem dar para ler o arquivo: nao sabe", telas.sunshine_tem_a_tela(None, BOA) is None)

# O Sunshine novo escreve um ID entre chaves no output_name (visto em
# 19/11/2026: "{9acddf6d-43cc-576e-9aff-0c5fc80b4cc8}" com a TV funcionando).
# Quem diz a que tela ele corresponde e o registro do proprio Sunshine.
ID_TV = "{9acddf6d-43cc-576e-9aff-0c5fc80b4cc8}"
LOG_SUNSHINE = os.path.join(PASTA, "sunshine.log")
with open(LOG_SUNSHINE, "w", encoding="utf-8") as _arq:
    _arq.write('[2026-11-19 18:00:00.000]: Info: Currently available display devices:\n[\n'
               '  {\n    "device_id": "{11111111-2222-3333-4444-555555555555}",\n'
               '    "display_name": "\\\\\\\\.\\\\DISPLAY1",\n    "friendly_name": "Monitor"\n  },\n'
               '  {\n    "device_id": "' + ID_TV + '",\n'
               '    "display_name": "\\\\\\\\.\\\\DISPLAY2",\n    "friendly_name": "Tela virtual"\n  }\n]\n')
conferir("id do Sunshine com a tela ligada: existe",
         telas.sunshine_tem_a_tela(ID_TV, BOA, LOG_SUNSHINE) is True)
conferir("id do Sunshine cuja tela sumiu do Windows: nao existe",
         telas.sunshine_tem_a_tela(ID_TV, BOA[:1], LOG_SUNSHINE) is False)
conferir("id que o registro nao conhece: nao sabe (sem alarme)",
         telas.sunshine_tem_a_tela("{00000000-0000-0000-0000-000000000000}", BOA, LOG_SUNSHINE) is None)
conferir("sem registro do Sunshine: nao sabe (sem alarme)",
         telas.sunshine_tem_a_tela(ID_TV, BOA, os.path.join(PASTA, "nao-existe.log")) is None)
with open(LOG_SUNSHINE, "a", encoding="utf-8") as _arq:
    _arq.write('[2026-11-19 19:00:00.000]: Info: Currently available display devices:\n[\n'
               '  {\n    "device_id": "' + ID_TV + '",\n    "display_name": "",\n'
               '    "friendly_name": "Tela virtual"\n  }\n]\n')
conferir("o Sunshine diz que a tela do id esta desligada: nao existe",
         telas.sunshine_tem_a_tela(ID_TV, BOA, LOG_SUNSHINE) is False)

print("\nO vigia das telas")
falsas = simulados.TelasSimuladas()
notas = []
guardado = os.path.join(PASTA, "_telas_boas.json")
v = telas.VigiaDasTelas(guardado, ler=falsas.ler, restaurar=falsas.restaurar, sunshine_conf=falsas.conf,
                        anotar=lambda titulo, ok, detalhe: notas.append((titulo, ok)), suportado=True)
v.olhar()
conferir("antes de alguem dizer qual e a certa: sem referencia, sem alerta",
         v.retrato()["estado"] == "sem_referencia" and v.retrato()["tem_boa"] is False and notas == [], v.retrato())
conferir("restaurar sem ter guardado e recusado", v.restaurar()[1] == 409)
corpo, codigo = v.guardar()
conferir("'Esta e a disposicao certa' guarda a de agora", codigo == 200 and os.path.exists(guardado) and corpo["detalhe"] == "2 tela(s)", corpo)
v.olhar()
conferir("guardada: ok", v.retrato()["estado"] == "ok" and v.retrato()["texto"] == "2 tela(s), como foi guardado")
falsas.mudar("resolucao")
v.olhar()
r = v.retrato()
conferir("o Windows trocou a resolucao: alerta com o motivo em uma linha",
         r["estado"] == "mudou" and r["texto"] == "a tela Tela do retorno mudou de 1920x1080 para 1280x720", r)
conferir("vai para o 'Aconteceu agora'", notas == [("As telas do PC mudaram", False)], notas)
v.olhar()
v.olhar()
conferir("uma vez so", len(notas) == 1)
corpo, codigo = v.restaurar()
conferir("'Restaurar a disposicao' poe de volta", codigo == 200 and corpo["ok"] is True and falsas.restauradas == 1 and v.retrato()["estado"] == "ok", corpo)
conferir("e anota que voltou", notas[-1] == ("As telas do PC voltaram ao normal", True), notas)
falsas.mudar("sumiu")
v.olhar()
r = v.retrato()
conferir("o cabo da tela do retorno soltou: o Sunshine esta apontado para uma tela que nao existe",
         r["estado"] == "sunshine_sem_tela" and r["sunshine"]["existe"] is False and "DISPLAY2" in r["texto"], r)
conferir("e isso vai para o historico", notas[-1] == ("A tela que vai para a TV sumiu", False))
corpo, codigo = v.restaurar()
conferir("restaurar nao traz de volta um monitor sem cabo, e diz isso", codigo == 200 and corpo["ok"] is False and "sumiu" in corpo["detalhe"], corpo)
falsas.mudar("ok")
v.olhar()
conferir("o cabo voltou: tudo certo de novo", v.retrato()["estado"] == "ok")
outro = telas.VigiaDasTelas(guardado, ler=falsas.ler, restaurar=falsas.restaurar, sunshine_conf=falsas.conf, suportado=True)
outro.olhar()
conferir("a disposicao guardada sobrevive a reiniciar a ponte", outro.retrato()["estado"] == "ok" and outro.retrato()["tem_boa"])
quebrado = telas.VigiaDasTelas(os.path.join(PASTA, "x.json"), ler=lambda: 1 / 0, suportado=True)
quebrado.olhar()
conferir("se o Windows nao deixar ler, nao estoura nem alerta", quebrado.retrato()["estado"] == "sem_leitura" and quebrado.guardar()[1] == 502)
fora = telas.VigiaDasTelas(os.path.join(PASTA, "y.json"), suportado=False)
fora.olhar()
conferir("fora do Windows: diz que nao funciona, sem estourar",
         fora.retrato()["estado"] == "nao_suportado" and fora.guardar()[1] == 400 and fora.restaurar()[1] == 400)

# ---------------------------------------------------------------------------
print("\nNo painel e na chegada")
import app as ponte   # noqa: E402

ponte.CAMINHO_PONTEIRO = os.path.join(PASTA, "_ordem_atual.json")
ponte.CAMINHO_LOUVOR = os.path.join(PASTA, "_louvor_atual.json")
ponte.CAMINHO_MARCAS = os.path.join(PASTA, "_marcas_louvor.json")
ponte.CAMINHO_PALAVRA = os.path.join(PASTA, "_palavra_do_dia.json")
ponte._config = ponte.carregar_config()
ponte._contexto = ponte.montar_contexto(ponte._config)
ponte._contexto["obs"] = ponte._contexto["obs_saude"] = simulados.ObsSimulado()
ponte._contexto["holyrics"] = ponte._contexto["holyrics_saude"] = simulados.HolyricsSimulado()
ponte._cues_por_id = ponte.indexar_cues(ponte._config)
ponte._ordens_por_id = ponte.indexar_ordens(ponte._config)
ponte._retomar_ordem(ponte._config)
ponte._chegada = ponte._montar_chegada()
TV = simulados.TvSimulada()
relogio = [1_800_000_000.0]
VIGIA = vigia_tv.VigiaDaTV({"log": TV.log, "assentar_s": 0}, ip_da_tv=TV.ip, na_tela=TV.na_tela, reabrir=TV.abrir_retorno,
                           relogio=lambda: relogio[0], dormir=lambda s: relogio.__setitem__(0, relogio[0] + s),
                           registrar=lambda linha: None, janela_do_culto=lambda agora: True, ligar=TV.ligar_pela_rede,
                           anotar=lambda titulo, ok, detalhe: ponte._anotar(titulo, ok, detalhe, "ponte"))
ponte._vigia["valor"] = VIGIA
ponte._chegada.ligar_vigia(VIGIA)
ponte._chegada.tela_da_tv = TV.na_tela
FALSAS = simulados.TelasSimuladas()
ponte._telas["valor"] = telas.VigiaDasTelas(os.path.join(PASTA, "_telas_painel.json"), ler=FALSAS.ler, restaurar=FALSAS.restaurar,
                                            sunshine_conf=FALSAS.conf, suportado=True,
                                            anotar=lambda titulo, ok, detalhe: ponte._anotar(titulo, ok, detalhe, "ponte"))
ponte._ao_vivo["valor"] = ponte._montar_ao_vivo()
cliente = ponte.app.test_client()


def acao(corpo, origem="local"):
    return ponte._acao_do_painel(corpo, origem)


def olhar(vezes=1):
    for _ in range(vezes):
        relogio[0] += 5
        VIGIA.olhar()
    ponte._telas["valor"].olhar()
    return cliente.get("/api/painel").get_json()


def linha(d, nome):
    return next((e for e in d["equipamentos"] if e["nome"] == nome), None)


d = olhar()
conferir("o painel mostra 'esperando a TV', com o motivo", d["retorno_tv"]["estado"] == "esperando_tv"
         and linha(d, "TV do altar") == {"nome": "TV do altar", "estado": "esperando a tv aparecer na rede", "cor": "ambar"}, linha(d, "TV do altar"))
medida = ponte._chegada._mede_tv_mostrando_retorno()
conferir("na chegada, o item fica vermelho dizendo por que", medida[0] is False and "nao esta na rede" in medida[1], medida)
TV.ligar()
d = olhar(3)
conferir("a TV apareceu: retorno aberto, linha verde", d["retorno_tv"]["no_ar"] is True and linha(d, "TV do altar")["cor"] == "verde", linha(d, "TV do altar"))
conferir("o historico do painel conta o ciclo", [f["titulo"] for f in ponte._historico][:3] == [
    "Retorno no ar na TV", "Abrindo o retorno na TV", "TV apareceu na rede"], [f["titulo"] for f in ponte._historico][:4])
medida = ponte._chegada._mede_tv_mostrando_retorno()
conferir("na chegada, verde so com as tres coisas", medida[0] is True and "TV ligada, retorno na tela" in medida[1], medida)
TV.app = "youtube.leanback.v4"
ponte._chegada._app_da_tv = (0.0, None)
medida = ponte._chegada._mede_tv_mostrando_retorno()
conferir("sessao no Sunshine mas outro aplicativo na tela: vermelho", medida[0] is False and "outro aplicativo" in medida[1], medida)
TV.desligar()
olhar(2)
ok, texto = ponte._chegada._faz_retorno_protocolo({})
conferir("'Tentar de novo' da chegada dispara o ciclo", ok is True and ponte._historico[0]["titulo"] == "Tentando abrir o retorno na TV, a pedido", texto)
corpo, codigo = acao({"tipo": "retorno", "acao": "tentar"})
conferir("e o do painel tambem", codigo == 200 and corpo["titulo"] == "Tentando abrir o retorno na TV")
conferir("o passo da chegada do repositorio usa a medida e o botao novos", any(
    p.get("confere") == "tv_mostrando_retorno" and p.get("acao") == "retorno_protocolo" and p.get("rotulo_acao") == "Tentar de novo"
    for p in ponte._chegada._roteiro["passos"]))

d = olhar()
conferir("as telas do PC entram no retrato e nos equipamentos", d["telas"]["estado"] == "sem_referencia" and linha(d, "Telas deste PC")["cor"] == "cinza", d["telas"])
conferir("pela web, guardar e restaurar sao recusados", acao({"tipo": "telas_guardar"}, "web")[1] == 403 and acao({"tipo": "telas_restaurar"}, "web")[1] == 403)
corpo, codigo = acao({"tipo": "telas_guardar"})
conferir("guardar pelo painel", codigo == 200 and ponte._historico[0]["titulo"] == "Disposição das telas guardada", corpo)
FALSAS.mudar("principal")
d = olhar()
conferir("mudou: equipamento vermelho e as diferencas no retrato", linha(d, "Telas deste PC") == {"nome": "Telas deste PC", "cor": "vermelho", "estado": "mudaram"}
         and len(d["telas"]["diferencas"]) == 2, d["telas"])
conferir("e o historico avisa", ponte._historico[0]["titulo"] == "As telas do PC mudaram" and ponte._historico[0]["ok"] is False)
corpo, codigo = acao({"tipo": "telas_restaurar"})
conferir("restaurar pelo painel", codigo == 200 and corpo["ok"] is True and olhar()["telas"]["estado"] == "ok", corpo)
conferir("as chaves antigas do retrato continuam", {"retorno_tv", "ordem", "sistemas", "transmissao", "telao", "luz"} <= set(d))

print("\nA janela do culto")
import time   # noqa: E402

agora = time.time()
ponte._config["vigia_tv"] = {"janela_do_culto": ["00:00", "23:59"]}
conferir("janela escrita no config: dentro", ponte._na_janela_do_culto(agora) is True)
hora = time.strftime("%H:%M", time.localtime(agora + 3 * 3600))
depois = time.strftime("%H:%M", time.localtime(agora + 4 * 3600))
ponte._config["vigia_tv"] = {"janela_do_culto": [hora, depois]}
conferir("fora dela", ponte._na_janela_do_culto(agora) is False)
ponte._config["vigia_tv"] = {}
conferir("sem janela e sem hora do culto: nao ha janela (vale a regra antiga)", ponte._na_janela_do_culto(agora) is False)
ponte._hora_do_culto = lambda: time.strftime("%H:%M", time.localtime(agora + 30 * 60))
conferir("com a hora do culto informada na chegada: 30 minutos antes ja e janela", ponte._na_janela_do_culto(agora) is True)
ponte._hora_do_culto = lambda: time.strftime("%H:%M", time.localtime(agora + 2 * 3600))
conferir("duas horas antes ainda nao", ponte._na_janela_do_culto(agora) is False)
ponte._config["vigia_tv"] = {"antes_min": 180}
conferir("`antes_min` do config estica a janela", ponte._na_janela_do_culto(agora) is True)

print("\n" + "-" * 58)
print("FALHAS: {}".format(len(FALHAS)))
sys.exit(1 if FALHAS else 0)
