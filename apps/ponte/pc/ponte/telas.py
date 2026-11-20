"""As telas do PC do Holyrics: perceber quando o Windows as reorganiza.

O PROBLEMA. O retorno da TV do altar e a tela DESTE PC, transmitida pelo
Sunshine. Quando o Windows muda a disposicao das telas (um monitor desligado,
um cabo HDMI solto ou encaixado, uma resolucao trocada), a tela que o Sunshine
captura pode virar outra, ou uma tela preta, e a TV passa a mostrar a coisa
errada sem ninguem ter mexido em nada.

O QUE ESTE ARQUIVO FAZ.
  - LE a disposicao das telas (quais estao ligadas, onde, com que resolucao,
    qual e a principal);
  - GUARDA a "disposicao boa", quando alguem diz "esta e a certa";
  - COMPARA de tempos em tempos e diz, em portugues, o que mudou;
  - RESTAURA a disposicao guardada, A PEDIDO, com confirmacao;
  - confere se a tela que o Sunshine transmite (`output_name` no
    sunshine.conf) ainda existe.

So no Windows, por ctypes, sem dependencia nova: EnumDisplayDevices e
EnumDisplaySettingsEx para ler, ChangeDisplaySettingsEx para restaurar.
NUNCA RODOU NUM WINDOWS. O que nao da para restaurar por aqui: um monitor que
esta fisicamente desligado ou sem cabo continua fora ate voltar.

A RECOMENDACAO que resolve de vez esta no README: uma tela virtual (um plugue
HDMI fantasma, ou um driver de tela virtual) so para o retorno, para ele nao
depender de um monitor de verdade.
"""

import json
import os
import re
import sys
import threading
import time

SUNSHINE_CONF = r"C:\Program Files\Sunshine\config\sunshine.conf"
PASSO = 10.0


def no_windows():
    return sys.platform == "win32"


# -- comparar (puro: roda em qualquer lugar) ----------------------------------

def _resumo(tela):
    return "{}x{}".format(tela.get("largura"), tela.get("altura"))


def comparar(boa, atual):
    """O que mudou da disposicao boa para a de agora, em frases. [] se nada."""
    frases = []
    boas = {t["nome"]: t for t in boa or []}
    atuais = {t["nome"]: t for t in atual or []}
    for nome, antes in boas.items():
        agora = atuais.get(nome)
        rotulo = antes.get("monitor") or nome
        if agora is None:
            frases.append("a tela {} sumiu".format(rotulo))
            continue
        if _resumo(antes) != _resumo(agora):
            frases.append("a tela {} mudou de {} para {}".format(rotulo, _resumo(antes), _resumo(agora)))
        if (antes.get("x"), antes.get("y")) != (agora.get("x"), agora.get("y")):
            frases.append("a tela {} mudou de lugar".format(rotulo))
        if bool(antes.get("principal")) != bool(agora.get("principal")):
            frases.append("a tela {} {} a principal".format(rotulo, "deixou de ser" if antes.get("principal") else "virou"))
        if antes.get("giro", 0) != agora.get("giro", 0):
            frases.append("a tela {} foi girada".format(rotulo))
        if antes.get("monitor") and agora.get("monitor") and antes["monitor"] != agora["monitor"]:
            frases.append("em {} agora há outro monitor ({})".format(nome, agora["monitor"]))
    for nome, agora in atuais.items():
        if nome not in boas:
            frases.append("apareceu uma tela nova ({})".format(agora.get("monitor") or nome))
    return frases


def saida_do_sunshine(caminho=SUNSHINE_CONF):
    """O `output_name` do sunshine.conf: a tela que o Sunshine transmite.
    "" se nao esta escrito (o Sunshine usa a principal); None se o arquivo
    nao pode ser lido."""
    try:
        with open(caminho, "r", encoding="utf-8-sig", errors="replace") as arquivo:
            texto = arquivo.read()
    except OSError:
        return None
    achado = re.search(r"^\s*output_name\s*=\s*(.*?)\s*$", texto, re.MULTILINE)
    return achado.group(1).strip() if achado else ""


# O Sunshine novo (2024 em diante) escreve no output_name o ID dele para a tela,
# entre chaves ("{9acddf6d-43cc-...}"), e nao o nome do Windows ("\\.\DISPLAY2").
# Esse ID nao aparece em nada que o Windows devolve: comparar direto dava
# "a tela sumiu" com a TV funcionando (visto em 19/11/2026). Quem sabe a que
# tela o ID corresponde e o proprio Sunshine, que lista no registro dele as
# telas que achou, com "device_id" e "display_name".
SUNSHINE_LOG = r"C:\Program Files\Sunshine\config\sunshine.log"
_ID_DO_SUNSHINE = re.compile(r"^\{[0-9a-fA-F-]{36}\}$")
CAUDA_DO_LOG = 2 * 1024 * 1024


def tela_do_id_no_log(identificador, caminho=SUNSHINE_LOG):
    """O display_name ("\\\\.\\DISPLAY2") que o Sunshine deu ao ID, pela ultima
    vez que listou as telas no registro. "" se ele listou o ID sem tela (a tela
    esta desligada); None se o registro nao diz nada sobre o ID."""
    try:
        with open(caminho, "rb") as arquivo:
            arquivo.seek(0, os.SEEK_END)
            tamanho = arquivo.tell()
            arquivo.seek(max(0, tamanho - CAUDA_DO_LOG))
            texto = arquivo.read().decode("utf-8", errors="replace")
    except OSError:
        return None
    padrao = re.compile(r'"device_id"\s*:\s*"' + re.escape(identificador) + r'"(.{0,400}?)"display_name"\s*:\s*"([^"]*)"',
                        re.IGNORECASE | re.DOTALL)
    achados = padrao.findall(texto)
    if not achados:
        return None
    nome = achados[-1][1]
    return nome.replace("\\\\", "\\")


def sunshine_tem_a_tela(saida, telas, log=SUNSHINE_LOG):
    """A tela escrita no sunshine.conf ainda existe? None se nao da para saber.
    Na duvida, None: um alarme falso no meio do culto atrapalha mais do que
    ajuda."""
    if saida is None:
        return None
    if saida == "":
        return True       # sem nada escrito, ele transmite a principal, que sempre existe
    if _ID_DO_SUNSHINE.match(saida.strip()):
        nome = tela_do_id_no_log(saida.strip(), log)
        if nome is None:
            return None   # o registro nao diz: nao da para saber
        if nome == "":
            return False  # o Sunshine conhece o ID, mas a tela esta desligada
        saida = nome
    alvo = saida.strip().lower()
    for tela in telas or []:
        for campo in ("nome", "id", "monitor"):
            valor = str(tela.get(campo) or "").lower()
            if valor and (valor == alvo or alvo in valor):
                return True
    return False


# -- ler e restaurar (so no Windows) ------------------------------------------

def _winapi():
    import ctypes
    from ctypes import wintypes

    class DISPLAY_DEVICEW(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("DeviceName", wintypes.WCHAR * 32),
                    ("DeviceString", wintypes.WCHAR * 128), ("StateFlags", wintypes.DWORD),
                    ("DeviceID", wintypes.WCHAR * 128), ("DeviceKey", wintypes.WCHAR * 128)]

    class DEVMODEW(ctypes.Structure):
        _fields_ = [("dmDeviceName", wintypes.WCHAR * 32), ("dmSpecVersion", wintypes.WORD),
                    ("dmDriverVersion", wintypes.WORD), ("dmSize", wintypes.WORD),
                    ("dmDriverExtra", wintypes.WORD), ("dmFields", wintypes.DWORD),
                    ("dmPositionX", wintypes.LONG), ("dmPositionY", wintypes.LONG),
                    ("dmDisplayOrientation", wintypes.DWORD), ("dmDisplayFixedOutput", wintypes.DWORD),
                    ("dmColor", ctypes.c_short), ("dmDuplex", ctypes.c_short),
                    ("dmYResolution", ctypes.c_short), ("dmTTOption", ctypes.c_short),
                    ("dmCollate", ctypes.c_short), ("dmFormName", wintypes.WCHAR * 32),
                    ("dmLogPixels", wintypes.WORD), ("dmBitsPerPel", wintypes.DWORD),
                    ("dmPelsWidth", wintypes.DWORD), ("dmPelsHeight", wintypes.DWORD),
                    ("dmDisplayFlags", wintypes.DWORD), ("dmDisplayFrequency", wintypes.DWORD),
                    ("dmICMMethod", wintypes.DWORD), ("dmICMIntent", wintypes.DWORD),
                    ("dmMediaType", wintypes.DWORD), ("dmDitherType", wintypes.DWORD),
                    ("dmReserved1", wintypes.DWORD), ("dmReserved2", wintypes.DWORD),
                    ("dmPanningWidth", wintypes.DWORD), ("dmPanningHeight", wintypes.DWORD)]

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.EnumDisplayDevicesW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(DISPLAY_DEVICEW), wintypes.DWORD]
    user32.EnumDisplaySettingsExW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(DEVMODEW), wintypes.DWORD]
    user32.ChangeDisplaySettingsExW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(DEVMODEW), wintypes.HWND, wintypes.DWORD, wintypes.LPVOID]
    user32.ChangeDisplaySettingsExW.restype = wintypes.LONG
    return ctypes, user32, DISPLAY_DEVICEW, DEVMODEW


def ler_disposicao():
    """As telas LIGADAS agora: [{nome, id, monitor, x, y, largura, altura,
    hz, giro, principal}]. `nome` e o do Windows (\\\\.\\DISPLAY1)."""
    if not no_windows():
        raise OSError("ler as telas só funciona no Windows")
    ctypes, user32, DISPLAY_DEVICEW, DEVMODEW = _winapi()
    telas, indice = [], 0
    while True:
        placa = DISPLAY_DEVICEW()
        placa.cb = ctypes.sizeof(DISPLAY_DEVICEW)
        if not user32.EnumDisplayDevicesW(None, indice, ctypes.byref(placa), 0):
            break
        indice += 1
        if not placa.StateFlags & 0x1:          # DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
            continue
        modo = DEVMODEW()
        modo.dmSize = ctypes.sizeof(DEVMODEW)
        if not user32.EnumDisplaySettingsExW(placa.DeviceName, -1 & 0xFFFFFFFF, ctypes.byref(modo), 0):   # ENUM_CURRENT_SETTINGS
            continue
        monitor = DISPLAY_DEVICEW()
        monitor.cb = ctypes.sizeof(DISPLAY_DEVICEW)
        tem_monitor = user32.EnumDisplayDevicesW(placa.DeviceName, 0, ctypes.byref(monitor), 0)
        telas.append({
            "nome": placa.DeviceName, "id": monitor.DeviceID if tem_monitor else "",
            "monitor": monitor.DeviceString if tem_monitor else "",
            "x": modo.dmPositionX, "y": modo.dmPositionY,
            "largura": modo.dmPelsWidth, "altura": modo.dmPelsHeight,
            "hz": modo.dmDisplayFrequency, "giro": modo.dmDisplayOrientation,
            "principal": bool(placa.StateFlags & 0x4),      # DISPLAY_DEVICE_PRIMARY_DEVICE
        })
    return telas


def restaurar_disposicao(boa):
    """Poe de volta posicao, resolucao, giro e tela principal de cada tela da
    disposicao guardada. Devolve a lista do que nao deu."""
    if not no_windows():
        raise OSError("restaurar as telas só funciona no Windows")
    ctypes, user32, _, DEVMODEW = _winapi()
    DM = 0x20 | 0x80 | 0x80000 | 0x100000 | 0x400000     # posicao, giro, largura, altura, frequencia
    CDS_UPDATEREGISTRY, CDS_NORESET, CDS_SET_PRIMARY = 0x1, 0x10000000, 0x10
    falhas = []
    for tela in sorted(boa or [], key=lambda t: not t.get("principal")):
        modo = DEVMODEW()
        modo.dmSize = ctypes.sizeof(DEVMODEW)
        modo.dmFields = DM
        modo.dmPositionX, modo.dmPositionY = int(tela["x"]), int(tela["y"])
        modo.dmPelsWidth, modo.dmPelsHeight = int(tela["largura"]), int(tela["altura"])
        modo.dmDisplayFrequency = int(tela.get("hz") or 60)
        modo.dmDisplayOrientation = int(tela.get("giro") or 0)
        opcoes = CDS_UPDATEREGISTRY | CDS_NORESET | (CDS_SET_PRIMARY if tela.get("principal") else 0)
        codigo = user32.ChangeDisplaySettingsExW(tela["nome"], ctypes.byref(modo), None, opcoes, None)
        if codigo != 0:
            falhas.append("{} (código {})".format(tela.get("monitor") or tela["nome"], codigo))
    user32.ChangeDisplaySettingsExW(None, None, None, 0, None)     # aplica tudo de uma vez
    return falhas


# -- o vigia -------------------------------------------------------------------

class VigiaDasTelas:
    def __init__(self, caminho_da_boa, ler=ler_disposicao, restaurar=restaurar_disposicao,
                 sunshine_conf=SUNSHINE_CONF, anotar=None, suportado=None, agora=time.time,
                 sunshine_log=SUNSHINE_LOG):
        self._caminho = caminho_da_boa
        self._ler = ler
        self._restaurar = restaurar
        self._sunshine_conf = sunshine_conf
        self._sunshine_log = sunshine_log
        self._anotar = anotar
        self._suportado = no_windows() if suportado is None else bool(suportado)
        self._agora = agora
        self._tranca = threading.Lock()
        self._atual = None
        self._erro = None
        self._boa = self._carregar()
        self._anotado = None          # a ultima situacao que foi para o historico

    def _carregar(self):
        try:
            with open(self._caminho, "r", encoding="utf-8-sig") as arquivo:
                dados = json.load(arquivo)
            return dados.get("telas") if isinstance(dados, dict) and isinstance(dados.get("telas"), list) else None
        except (OSError, ValueError):
            return None

    def _nota(self, titulo, ok, detalhe=""):
        if self._anotar is not None:
            try:
                self._anotar(titulo, ok, detalhe)
            except Exception:
                pass

    def olhar(self):
        if not self._suportado:
            return
        try:
            atual = self._ler()
            erro = None
        except Exception as falha:
            atual, erro = None, str(falha)[:160]
        with self._tranca:
            self._atual, self._erro = atual, erro
        retrato = self.retrato()
        situacao = (retrato["estado"], tuple(retrato["diferencas"]))
        if situacao != self._anotado:
            antes, self._anotado = self._anotado, situacao
            if retrato["estado"] == "mudou":
                self._nota("As telas do PC mudaram", False, "; ".join(retrato["diferencas"])[:200])
            elif retrato["estado"] == "sunshine_sem_tela":
                self._nota("A tela que vai para a TV sumiu", False, retrato["texto"])
            elif retrato["estado"] == "ok" and antes is not None and antes[0] in ("mudou", "sunshine_sem_tela"):
                self._nota("As telas do PC voltaram ao normal", True, "tudo certo")

    def comecar(self):
        def laco():
            while True:
                try:
                    self.olhar()
                except Exception as erro:
                    print("  [telas] o vigia tropecou: {}".format(str(erro)[:160]))
                time.sleep(PASSO)
        threading.Thread(target=laco, daemon=True).start()

    def retrato(self):
        with self._tranca:
            atual, boa, erro = self._atual, self._boa, self._erro
        corpo = {"suportado": self._suportado, "estado": "nao_suportado", "texto": "só funciona no Windows",
                 "diferencas": [], "tem_boa": boa is not None, "telas": len(atual) if atual else 0,
                 "sunshine": None}
        if not self._suportado:
            return corpo
        if atual is None:
            corpo.update({"estado": "sem_leitura", "texto": erro or "ainda não li as telas"})
            return corpo
        saida = saida_do_sunshine(self._sunshine_conf)
        existe = sunshine_tem_a_tela(saida, atual, self._sunshine_log)
        corpo["sunshine"] = {"saida": saida, "existe": existe}
        if existe is False:
            corpo.update({"estado": "sunshine_sem_tela",
                          "texto": "o Sunshine está apontado para uma tela que não existe mais ({})".format(saida)})
            corpo["diferencas"] = comparar(boa, atual) if boa is not None else []
            return corpo
        if boa is None:
            corpo.update({"estado": "sem_referencia",
                          "texto": "ninguém disse ainda qual é a disposição certa das telas"})
            return corpo
        diferencas = comparar(boa, atual)
        corpo["diferencas"] = diferencas
        if diferencas:
            corpo.update({"estado": "mudou", "texto": diferencas[0] + (
                " (e mais {})".format(len(diferencas) - 1) if len(diferencas) > 1 else "")})
        else:
            corpo.update({"estado": "ok", "texto": "{} tela(s), como foi guardado".format(len(atual))})
        return corpo

    # -- a pedido de alguem ----------------------------------------------------

    def guardar(self):
        """"Esta e a disposicao certa": guarda a de agora."""
        if not self._suportado:
            return {"erro": "isso só funciona no Windows"}, 400
        try:
            atual = self._ler()
        except Exception as erro:
            return {"erro": "não consegui ler as telas: " + str(erro)[:120]}, 502
        if not atual:
            return {"erro": "o Windows não mostrou nenhuma tela ligada"}, 409
        try:
            with open(self._caminho, "w", encoding="utf-8") as arquivo:
                json.dump({"guardada_em": time.strftime("%Y-%m-%d %H:%M"), "telas": atual}, arquivo,
                          ensure_ascii=False, indent=1)
        except OSError as erro:
            return {"erro": "não consegui gravar: " + str(erro)[:120]}, 500
        with self._tranca:
            self._boa, self._atual = atual, atual
        return {"ok": True, "titulo": "Disposição das telas guardada",
                "detalhe": "{} tela(s)".format(len(atual))}, 200

    def restaurar(self):
        if not self._suportado:
            return {"erro": "isso só funciona no Windows"}, 400
        with self._tranca:
            boa = self._boa
        if boa is None:
            return {"erro": "não há disposição guardada para restaurar"}, 409
        try:
            falhas = self._restaurar(boa)
        except Exception as erro:
            return {"erro": "não consegui restaurar: " + str(erro)[:120]}, 502
        self.olhar()
        ainda = self.retrato()["diferencas"]
        if falhas or ainda:
            return {"ok": False, "titulo": "Restaurar a disposição das telas",
                    "detalhe": ("o Windows recusou: " + ", ".join(falhas) + ". " if falhas else "")
                               + ("Ainda diferente: " + "; ".join(ainda) if ainda else "")}, 200
        return {"ok": True, "titulo": "Disposição das telas restaurada", "detalhe": "tudo certo"}, 200
